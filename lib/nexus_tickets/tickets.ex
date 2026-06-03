defmodule NexusTickets.Tickets do
  import Ecto.Query
  alias Nexus.Repo
  alias NexusTickets.{Ticket, Reply}

  # ---------------------------------------------------------------------------
  # Ticket queries
  # ---------------------------------------------------------------------------

  @doc """
  Lists tickets for a member — returns only their own non-deleted tickets.
  Ordered by most recently updated first.
  """
  def list_tickets_for_user(user_id) do
    Ticket
    |> where([t], t.user_id == ^user_id and is_nil(t.deleted_at))
    |> order_by([t], desc: t.inserted_at)
    |> preload([:category, :user, :assigned_staff])
    |> Repo.all()
  end

  @doc """
  Lists all non-deleted tickets for staff, with optional status filter.
  Ordered by last_reply_at (most recently active first), then inserted_at.
  """
  def list_tickets_for_staff(opts \\ []) do
    status = Keyword.get(opts, :status)

    query =
      Ticket
      |> where([t], is_nil(t.deleted_at))
      |> order_by([t], [
        desc_nulls_last: t.last_reply_at,
        desc: t.inserted_at
      ])
      |> preload([:category, :user, :assigned_staff])

    query =
      if status && status in Ticket.statuses() do
        where(query, [t], t.status == ^status)
      else
        query
      end

    Repo.all(query)
  end

  def get_ticket(id) do
    Ticket
    |> where([t], t.id == ^id and is_nil(t.deleted_at))
    |> preload([:category, :user, :assigned_staff])
    |> Repo.one()
  end

  def get_ticket_with_replies(id, include_internal_notes \\ false) do
    ticket =
      Ticket
      |> where([t], t.id == ^id and is_nil(t.deleted_at))
      |> preload([:category, :user, :assigned_staff])
      |> Repo.one()

    case ticket do
      nil -> nil
      ticket ->
        replies =
          Reply
          |> where([r], r.ticket_id == ^ticket.id)
          |> then(fn q ->
            if include_internal_notes, do: q, else: where(q, [r], r.is_internal_note == false)
          end)
          |> order_by([r], asc: r.inserted_at)
          |> preload([:user, :edited_by_user])
          |> Repo.all()

        %{ticket | replies: replies}
    end
  end

  @doc """
  Creates a ticket and its opening reply in a transaction.
  Returns {:ok, ticket} or {:error, reason}.
  """
  def create_ticket(attrs) do
    Repo.transaction(fn ->
      ticket_attrs = Map.take(attrs, ["subject", "category_id", "user_id"])

      ticket =
        %Ticket{}
        |> Ticket.changeset(ticket_attrs)
        |> Repo.insert!()

      # The opening message becomes the first reply
      reply_attrs = %{
        "ticket_id" => ticket.id,
        "user_id"   => ticket_attrs["user_id"],
        "content"   => attrs["message"],
        "is_internal_note" => false
      }

      %Reply{}
      |> Reply.changeset(reply_attrs)
      |> Repo.insert!()

      Repo.preload(ticket, [:category, :user, :assigned_staff])
    end)
  end

  def update_ticket(%Ticket{} = ticket, attrs) do
    ticket
    |> Ticket.changeset(attrs)
    |> Repo.update()
  end

  def soft_delete_ticket(%Ticket{} = ticket) do
    ticket
    |> Ticket.changeset(%{deleted_at: DateTime.utc_now() |> DateTime.truncate(:second)})
    |> Repo.update()
  end

  def restore_ticket(%Ticket{} = ticket) do
    ticket
    |> Ticket.changeset(%{deleted_at: nil})
    |> Repo.update()
  end

  # ---------------------------------------------------------------------------
  # Reply operations
  # ---------------------------------------------------------------------------

  def get_reply(id) do
    Reply
    |> preload([:user, :edited_by_user])
    |> Repo.get(id)
  end

  def create_reply(attrs) do
    changeset = Reply.changeset(%Reply{}, attrs)

    Repo.transaction(fn ->
      reply = Repo.insert!(changeset)

      # Update last_reply_at on the ticket
      now = DateTime.utc_now() |> DateTime.truncate(:second)
      from(t in Ticket, where: t.id == ^reply.ticket_id)
      |> Repo.update_all(set: [last_reply_at: now])

      Repo.preload(reply, [:user, :edited_by_user])
    end)
  end

  def update_reply(%Reply{} = reply, attrs) do
    reply
    |> Reply.changeset(attrs)
    |> Repo.update()
  end

  def delete_reply(%Reply{} = reply) do
    Repo.delete(reply)
  end

  # ---------------------------------------------------------------------------
  # Staff helpers
  # ---------------------------------------------------------------------------

  @doc "Returns all users with moderator or admin role, for the assignment picker."
  def list_staff do
    from(u in "users",
      where: u.role in ["moderator", "admin"],
      order_by: [asc: u.username],
      select: %{
        id:         u.id,
        username:   u.username,
        avatar_url: u.avatar_url,
        avatar_color: u.avatar_color,
        role:       u.role
      }
    )
    |> Repo.all()
  end

  # ---------------------------------------------------------------------------
  # Counts
  # ---------------------------------------------------------------------------

  def open_ticket_count do
    Repo.aggregate(
      from(t in Ticket,
        where: t.status in ["open", "in_progress", "awaiting_user"] and is_nil(t.deleted_at)
      ),
      :count
    )
  end

  def user_ticket_counts(user_id) do
    counts =
      from(t in Ticket,
        where: t.user_id == ^user_id and is_nil(t.deleted_at),
        group_by: t.status,
        select: {t.status, count(t.id)}
      )
      |> Repo.all()
      |> Map.new()

    %{
      open:          Map.get(counts, "open", 0),
      in_progress:   Map.get(counts, "in_progress", 0),
      awaiting_user: Map.get(counts, "awaiting_user", 0),
      resolved:      Map.get(counts, "resolved", 0),
      closed:        Map.get(counts, "closed", 0),
      total:         Enum.sum(Map.values(counts))
    }
  end

  @doc """
  Returns true if the given reply is the opening message of its ticket.
  The opening reply is the one with the earliest inserted_at for that ticket.
  Used to prevent staff from deleting the ticket body.
  """
  def is_opening_reply?(%Reply{id: reply_id, ticket_id: ticket_id}) do
    oldest_id =
      from(r in Reply,
        where: r.ticket_id == ^ticket_id,
        order_by: [asc: r.inserted_at],
        limit: 1,
        select: r.id
      )
      |> Repo.one()

    oldest_id == reply_id
  end
end
