defmodule NexusTickets.ApiRouter do
  use Plug.Router

  alias NexusTickets.Categories
  alias Nexus.Extensions.Permissions

  plug :match
  plug :dispatch

  # ---------------------------------------------------------------------------
  # Category endpoints — admin only (can_manage_categories)
  # ---------------------------------------------------------------------------

  # GET /ext/nexus-tickets/api/admin/categories
  get "/admin/categories" do
    case check_permission(conn, "can_manage_categories") do
      :error -> forbidden(conn)
      :ok ->
        categories = Categories.list_categories()
        send_json(conn, 200, %{categories: Enum.map(categories, &category_json/1)})
    end
  end

  # POST /ext/nexus-tickets/api/admin/categories
  post "/admin/categories" do
    case check_permission(conn, "can_manage_categories") do
      :error -> forbidden(conn)
      :ok ->
        attrs = conn.body_params

        case Categories.create_category(attrs) do
          {:ok, category} ->
            send_json(conn, 201, %{category: category_json(category)})

          {:error, changeset} ->
            send_json(conn, 422, %{errors: format_errors(changeset)})
        end
    end
  end

  # PATCH /ext/nexus-tickets/api/admin/categories/:id
  patch "/admin/categories/:id" do
    case check_permission(conn, "can_manage_categories") do
      :error -> forbidden(conn)
      :ok ->
        case Categories.get_category(conn.params["id"]) do
          nil ->
            send_json(conn, 404, %{error: "Category not found"})

          category ->
            attrs = conn.body_params

            case Categories.update_category(category, attrs) do
              {:ok, updated} ->
                send_json(conn, 200, %{category: category_json(updated)})

              {:error, changeset} ->
                send_json(conn, 422, %{errors: format_errors(changeset)})
            end
        end
    end
  end

  # DELETE /ext/nexus-tickets/api/admin/categories/:id
  delete "/admin/categories/:id" do
    case check_permission(conn, "can_manage_categories") do
      :error -> forbidden(conn)
      :ok ->
        case Categories.get_category(conn.params["id"]) do
          nil ->
            send_json(conn, 404, %{error: "Category not found"})

          category ->
            {:ok, _} = Categories.delete_category(category)
            send_json(conn, 200, %{ok: true})
        end
    end
  end

  # POST /ext/nexus-tickets/api/admin/categories/reorder
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
  # Public category list — any authenticated user (used in later stages)
  # ---------------------------------------------------------------------------

  # GET /ext/nexus-tickets/api/categories
  get "/categories" do
    case conn.assigns[:current_user] do
      nil -> unauthorized(conn)
      _   ->
        categories = Categories.list_categories()
        send_json(conn, 200, %{categories: Enum.map(categories, &category_json/1)})
    end
  end

  # ---------------------------------------------------------------------------
  # Catch-all
  # ---------------------------------------------------------------------------

  match _ do
    send_json(conn, 404, %{error: "Not found"})
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp check_permission(conn, key) do
    Permissions.check("nexus-tickets", key, conn.assigns[:current_user])
  end

  defp forbidden(conn),    do: send_json(conn, 403, %{error: "Forbidden"})
  defp unauthorized(conn), do: send_json(conn, 401, %{error: "Login required"})

  defp send_json(conn, status, body) do
    conn
    |> Plug.Conn.put_resp_content_type("application/json")
    |> Plug.Conn.send_resp(status, Jason.encode!(body))
  end

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

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end
end
