defmodule NexusTickets.ApiRouter do
  use Plug.Router

  import Ecto.Query
  alias NexusTickets.{Categories, Tickets, Ticket, Reply}
  alias Nexus.Extensions.Permissions
  alias Nexus.RateLimiter

  plug :match
  plug :dispatch

  # ---------------------------------------------------------------------------
  # Category endpoints
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
          {:ok, category}     -> send_json(conn, 201, %{category: category_json(category)})
          {:error, changeset} -> send_json(conn, 422, %{errors: format_errors(changeset)})
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
              {:ok, updated}      -> send_json(conn, 200, %{category: category_json(updated)})
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
  # Staff — list all tickets
  # ---------------------------------------------------------------------------

  get "/admin/tickets" do
    case check_permission(conn, "can_handle_tickets") do
      :error -> forbidden(conn)
      :ok ->
        status  = conn.params["status"]
        tickets = Tickets.list_tickets_for_staff(status: status)
        send_json(conn, 200, %{tickets: Enum.map(tickets, &ticket_json/1)})
    end
  end

  # ---------------------------------------------------------------------------
  # Staff — staff user list for assignment picker
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
      nil  -> unauthorized(conn)
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
      nil  -> unauthorized(conn)
      user ->
        case check_permission(conn, "can_create_ticket") do
          :error -> forbidden(conn)
          :ok ->
            ext      = Nexus.Extensions.get_extension_by_slug("nexus-tickets")
            settings = (ext && ext.settings) || %{}
            limit    = (settings["ticket_limit_per_window"] || 10) |> to_integer()
            window   = ((settings["ticket_window_hours"]    || 24) |> to_integer()) * 3600
            bucket   = "nexus-tickets:create:#{user.id}"

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
  # Get ticket detail (with replies)
  # ---------------------------------------------------------------------------

  get "/tickets/:id" do
    case conn.assigns[:current_user] do
      nil  -> unauthorized(conn)
      user ->
        is_staff = staff?(user)
        ticket   = Tickets.get_ticket_with_replies(conn.params["id"], is_staff)
        cond do
          is_nil(ticket)                          -> send_json(conn, 404, %{error: "Ticket not found"})
          not is_staff and ticket.user_id != user.id -> send_json(conn, 403, %{error: "Forbidden"})
          true                                    -> send_json(conn, 200, %{ticket: ticket_detail_json(ticket)})
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
  # Post a reply
  # ---------------------------------------------------------------------------

  post "/tickets/:id/replies" do
    case conn.assigns[:current_user] do
      nil  -> unauthorized(conn)
      user ->
        is_staff = staff?(user)
        ticket   = Tickets.get_ticket(conn.params["id"])

        cond do
          is_nil(ticket) ->
            send_json(conn, 404, %{error: "Ticket not found"})

          # Ticket owner and staff can access. Others cannot.
          not is_staff and ticket.user_id != user.id ->
            send_json(conn, 403, %{error: "Forbidden"})

          # Members cannot reply to closed tickets.
          not is_staff and ticket.status == "closed" ->
            send_json(conn, 422, %{error: "This ticket is closed."})

          true ->
            # Only staff may post internal notes.
            is_internal_note =
              is_staff and conn.body_params["is_internal_note"] == true

            attrs = %{
              "ticket_id"       => ticket.id,
              "user_id"         => user.id,
              "content"         => conn.body_params["content"],
              "is_internal_note"=> is_internal_note
            }

            case Tickets.create_reply(attrs) do
              {:ok, reply} ->
                notify_on_reply(ticket, reply, user, is_staff, is_internal_note)
                send_json(conn, 201, %{reply: reply_json(reply)})

              {:error, changeset} ->
                send_json(conn, 422, %{errors: format_errors(changeset)})
            end
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Edit a reply
  # ---------------------------------------------------------------------------

  patch "/replies/:id" do
    case conn.assigns[:current_user] do
      nil  -> unauthorized(conn)
      user ->
        is_staff = staff?(user)
        reply    = Tickets.get_reply(conn.params["id"])

        cond do
          is_nil(reply) ->
            send_json(conn, 404, %{error: "Reply not found"})

          # Own reply or staff required.
          not is_staff and reply.user_id != user.id ->
            send_json(conn, 403, %{error: "Forbidden"})

          true ->
            now = DateTime.utc_now() |> DateTime.truncate(:second)
            attrs = %{
              "content"           => conn.body_params["content"],
              "edited_at"         => now,
              "edited_by_user_id" => user.id
            }

            case Tickets.update_reply(reply, attrs) do
              {:ok, updated} ->
                updated = Nexus.Repo.preload(updated, [:user, :edited_by_user])
                send_json(conn, 200, %{reply: reply_json(updated)})

              {:error, changeset} ->
                send_json(conn, 422, %{errors: format_errors(changeset)})
            end
        end
    end
  end

  # ---------------------------------------------------------------------------
  # Delete a reply (hard delete, staff only)
  # ---------------------------------------------------------------------------

  delete "/replies/:id" do
    case check_permission(conn, "can_handle_tickets") do
      :error -> forbidden(conn)
      :ok ->
        reply = Tickets.get_reply(conn.params["id"])

        cond do
          is_nil(reply) ->
            send_json(conn, 404, %{error: "Reply not found"})

          # Prevent deleting the opening reply — it is the ticket body.
          Tickets.is_opening_reply?(reply) ->
            send_json(conn, 422, %{error: "Cannot delete the opening message of a ticket."})

          true ->
            {:ok, _} = Tickets.delete_reply(reply)
            send_json(conn, 200, %{ok: true})
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

  defp staff?(user), do: user.role in ["moderator", "admin"]

  defp notify_staff_new_ticket(ticket, actor) do
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

  defp notify_on_reply(ticket, reply, actor, is_staff, is_internal_note) do
    cond do
      # Internal notes never trigger notifications.
      is_internal_note ->
        :ok

      # Staff replied — notify the ticket creator (if they exist and aren't
      # the one replying, e.g. staff member who also created the ticket).
      is_staff and not is_nil(ticket.user_id) and ticket.user_id != actor.id ->
        Nexus.Notifications.notify_extension("nexus-tickets", "new_reply",
          user_id:  ticket.user_id,
          actor_id: actor.id,
          data: %{
            "ticket_id"      => ticket.id,
            "ticket_subject" => ticket.subject
          }
        )

      # Member replied — notify assigned staff if assigned, otherwise all staff.
      not is_staff ->
        recipient_ids =
          if ticket.assigned_staff_id do
            [ticket.assigned_staff_id]
          else
            from(u in "users",
              where: u.role in ["moderator", "admin"],
              select: u.id
            )
            |> Nexus.Repo.all()
          end

        Enum.each(recipient_ids, fn staff_id ->
          # Don't notify the staff member who is also the ticket creator
          # replying to their own ticket (edge case).
          if staff_id != actor.id do
            Nexus.Notifications.notify_extension("nexus-tickets", "new_reply",
              user_id:  staff_id,
              actor_id: actor.id,
              data: %{
                "ticket_id"      => ticket.id,
                "ticket_subject" => ticket.subject
              }
            )
          end
        end)

      true ->
        :ok
    end
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
      id:             t.id,
      subject:        t.subject,
      status:         t.status,
      last_reply_at:  format_dt(t.last_reply_at),
      inserted_at:    format_dt(t.inserted_at),
      category:       t.category && category_json(t.category),
      user:           t.user && user_json(t.user),
      assigned_staff: t.assigned_staff && user_json(t.assigned_staff)
    }
  end

  defp ticket_detail_json(ticket) do
    Map.put(ticket_json(ticket), :replies,
      Enum.map(ticket.replies, &reply_json/1)
    )
  end

  defp reply_json(r) do
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
