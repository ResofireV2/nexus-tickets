defmodule NexusTickets.ApiRouter do
  use Plug.Router

  import Ecto.Query
  alias NexusTickets.{Categories, Tickets, Ticket}
  alias Nexus.Extensions.Permissions
  alias Nexus.RateLimiter

  plug :match
  plug :dispatch

  # ---------------------------------------------------------------------------
  # Category endpoints — admin only (can_manage_categories)
  # ---------------------------------------------------------------------------

  get "/admin/categories" do
    case check_permission(conn, "can_manage_categories") do
      :error -> forbidden(conn)
      :ok ->
        categories = Categories.list_categories()
        send_json(conn, 200, %{categories: Enum.map(categories, &category_json/1)})
    end
  end

  post "/admin/categories" do
    case check_permission(conn, "can_manage_categories") do
      :error -> forbidden(conn)
      :ok ->
        case Categories.create_category(conn.body_params) do
          {:ok, category} ->
            send_json(conn, 201, %{category: category_json(category)})
          {:error, changeset} ->
            send_json(conn, 422, %{errors: format_errors(changeset)})
        end
    end
  end

  patch "/admin/categories/:id" do
    case check_permission(conn, "can_manage_categories") do
      :error -> forbidden(conn)
      :ok ->
        case Categories.get_category(conn.params["id"]) do
          nil -> send_json(conn, 404, %{error: "Category not found"})
          category ->
            case Categories.update_category(category, conn.body_params) do
              {:ok, updated}     -> send_json(conn, 200, %{category: category_json(updated)})
              {:error, changeset} -> send_json(conn, 422, %{errors: format_errors(changeset)})
            end
        end
    end
  end

  delete "/admin/categories/:id" do
    case check_permission(conn, "can_manage_categories") do
      :error -> forbidden(conn)
      :ok ->
        case Categories.get_category(conn.params["id"]) do
          nil      -> send_json(conn, 404, %{error: "Category not found"})
          category ->
            {:ok, _} = Categories.delete_category(category)
            send_json(conn, 200, %{ok: true})
        end
    end
  end

  post "/admin/categories/reorder" do
    case check_permission(conn, "can_manage_categories") do
      :error -> forbidden(conn)
      :ok ->
        case conn.body_params do
          %{"ids" => ids} when is_list(ids) ->
            :ok = Categories.reorder_categories(ids)
            send_json(conn, 200, %{ok: true})
          _ ->
            send_json(conn, 422, %{error: "ids must be a list"})
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Public category list
  # ---------------------------------------------------------------------------

  get "/categories" do
    case conn.assigns[:current_user] do
      nil -> unauthorized(conn)
      _ ->
        categories = Categories.list_categories()
        send_json(conn, 200, %{categories: Enum.map(categories, &category_json/1)})
    end
  end

  # ---------------------------------------------------------------------------
  # Staff — list all tickets (with optional status filter)
  # ---------------------------------------------------------------------------

  get "/admin/tickets" do
    case check_permission(conn, "can_handle_tickets") do
      :error -> forbidden(conn)
      :ok ->
        status = conn.params["status"]
        tickets = Tickets.list_tickets_for_staff(status: status)
        send_json(conn, 200, %{tickets: Enum.map(tickets, &ticket_json/1)})
    end
  end

  # ---------------------------------------------------------------------------
  # Staff — list staff users for assignment picker
  # ---------------------------------------------------------------------------

  get "/admin/staff" do
    case check_permission(conn, "can_handle_tickets") do
      :error -> forbidden(conn)
      :ok ->
        staff = Tickets.list_staff()
        send_json(conn, 200, %{staff: staff})
    end
  end

  # ---------------------------------------------------------------------------
  # Ticket list — member sees own tickets
  # ---------------------------------------------------------------------------

  get "/tickets" do
    case conn.assigns[:current_user] do
      nil -> unauthorized(conn)
      user ->
        tickets = Tickets.list_tickets_for_user(user.id)
        send_json(conn, 200, %{tickets: Enum.map(tickets, &ticket_json/1)})
    end
  end

  # ---------------------------------------------------------------------------
  # Create ticket
  # ---------------------------------------------------------------------------

  post "/tickets" do
    case conn.assigns[:current_user] do
      nil -> unauthorized(conn)
      user ->
        case check_permission(conn, "can_create_ticket") do
          :error -> forbidden(conn)
          :ok ->
            # Rate limit check
            ext = Nexus.Extensions.get_extension_by_slug("nexus-tickets")
            settings = (ext && ext.settings) || %{}
            limit   = (settings["ticket_limit_per_window"] || 10) |> to_integer()
            window  = ((settings["ticket_window_hours"] || 24) |> to_integer()) * 3600

            bucket = "nexus-tickets:create:#{user.id}"

            case RateLimiter.check(bucket, limit: limit, window_seconds: window) do
              {:deny, retry_after} ->
                send_json(conn, 429, %{
                  error:       "Too many tickets. Please wait before opening another.",
                  retry_after: retry_after
                })

              :allow ->
                attrs = Map.merge(conn.body_params, %{"user_id" => user.id})

                case Tickets.create_ticket(attrs) do
                  {:ok, ticket} ->
                    # Notify staff of new ticket
                    notify_staff_new_ticket(ticket, user)
                    send_json(conn, 201, %{ticket: ticket_json(ticket)})

                  {:error, reason} ->
                    send_json(conn, 422, %{error: inspect(reason)})
                end
            end
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Get ticket detail
  # ---------------------------------------------------------------------------

  get "/tickets/:id" do
    case conn.assigns[:current_user] do
      nil -> unauthorized(conn)
      user ->
        is_staff = staff?(user)
        ticket   = Tickets.get_ticket_with_replies(conn.params["id"], is_staff)

        cond do
          is_nil(ticket) ->
            send_json(conn, 404, %{error: "Ticket not found"})

          not is_staff and ticket.user_id != user.id ->
            send_json(conn, 403, %{error: "Forbidden"})

          true ->
            send_json(conn, 200, %{ticket: ticket_detail_json(ticket, is_staff)})
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Soft delete / restore ticket
  # ---------------------------------------------------------------------------

  delete "/tickets/:id" do
    case check_permission(conn, "can_delete_tickets") do
      :error -> forbidden(conn)
      :ok ->
        case Tickets.get_ticket(conn.params["id"]) do
          nil    -> send_json(conn, 404, %{error: "Ticket not found"})
          ticket ->
            {:ok, _} = Tickets.soft_delete_ticket(ticket)
            send_json(conn, 200, %{ok: true})
        end
    end
  end

  patch "/tickets/:id/restore" do
    case check_permission(conn, "can_delete_tickets") do
      :error -> forbidden(conn)
      :ok ->
        # Must fetch including deleted
        ticket = Nexus.Repo.get(Ticket, conn.params["id"])

        case ticket do
          nil    -> send_json(conn, 404, %{error: "Ticket not found"})
          ticket ->
            {:ok, updated} = Tickets.restore_ticket(ticket)
            updated = Nexus.Repo.preload(updated, [:category, :user, :assigned_staff])
            send_json(conn, 200, %{ticket: ticket_json(updated)})
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Catch-all
  # ---------------------------------------------------------------------------

  match _ do
    send_json(conn, 404, %{error: "Not found"})
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp check_permission(conn, key) do
    Permissions.check("nexus-tickets", key, conn.assigns[:current_user])
  end

  defp staff?(user) do
    user.role in ["moderator", "admin"]
  end

  defp notify_staff_new_ticket(ticket, actor) do
    # Fire to all staff users. We query by role directly to avoid
    # loading the full user list into memory repeatedly.
    staff_ids =
      from(u in "users",
        where: u.role in ["moderator", "admin"],
        select: u.id
      )
      |> Nexus.Repo.all()

    Enum.each(staff_ids, fn staff_id ->
      Nexus.Notifications.notify_extension("nexus-tickets", "new_ticket",
        user_id:  staff_id,
        actor_id: actor.id,
        data: %{
          "ticket_id"      => ticket.id,
          "ticket_subject" => ticket.subject
        }
      )
    end)
  end

  defp forbidden(conn),    do: send_json(conn, 403, %{error: "Forbidden"})
  defp unauthorized(conn), do: send_json(conn, 401, %{error: "Login required"})

  defp send_json(conn, status, body) do
    conn
    |> Plug.Conn.put_resp_content_type("application/json")
    |> Plug.Conn.send_resp(status, Jason.encode!(body))
  end

  defp to_integer(v) when is_integer(v), do: v
  defp to_integer(v) when is_float(v),   do: round(v)
  defp to_integer(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_integer(_), do: 0

  defp category_json(c) do
    %{
      id:          c.id,
      name:        c.name,
      slug:        c.slug,
      description: c.description,
      color:       c.color,
      icon:        c.icon,
      position:    c.position
    }
  end

  defp ticket_json(t) do
    %{
      id:          t.id,
      subject:     t.subject,
      status:      t.status,
      last_reply_at: format_dt(t.last_reply_at),
      inserted_at: format_dt(t.inserted_at),
      category:    t.category && category_json(t.category),
      user:        t.user && user_json(t.user),
      assigned_staff: t.assigned_staff && user_json(t.assigned_staff)
    }
  end

  defp ticket_detail_json(ticket, include_internal_notes) do
    Map.put(ticket_json(ticket), :replies,
      Enum.map(ticket.replies, &reply_json(&1, include_internal_notes))
    )
  end

  defp reply_json(r, _include_internal_notes) do
    %{
      id:               r.id,
      content:          r.content,
      is_internal_note: r.is_internal_note,
      edited_at:        format_dt(r.edited_at),
      inserted_at:      format_dt(r.inserted_at),
      user:             r.user && user_json(r.user),
      edited_by_user:   r.edited_by_user && user_json(r.edited_by_user)
    }
  end

  defp user_json(u) do
    %{
      id:           u.id,
      username:     u.username,
      avatar_url:   u.avatar_url,
      avatar_color: u.avatar_color,
      role:         u.role
    }
  end

  defp format_dt(nil), do: nil
  defp format_dt(dt),  do: DateTime.to_iso8601(dt)

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end
end
