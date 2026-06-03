defmodule NexusTickets.Categories do
  import Ecto.Query
  alias Nexus.Repo
  alias NexusTickets.Category

  @doc "Returns all categories ordered by position, then name."
  def list_categories do
    Category
    |> order_by([c], [asc: c.position, asc: c.name])
    |> Repo.all()
  end

  def get_category(id), do: Repo.get(Category, id)

  def get_category_by_slug(slug), do: Repo.get_by(Category, slug: slug)

  @doc "Creates a category. Position defaults to end of list."
  def create_category(attrs) do
    attrs = maybe_set_position(attrs)

    %Category{}
    |> Category.changeset(attrs)
    |> Repo.insert()
  end

  def update_category(%Category{} = category, attrs) do
    category
    |> Category.changeset(attrs)
    |> Repo.update()
  end

  def delete_category(%Category{} = category) do
    Repo.delete(category)
  end

  @doc """
  Reorders categories by accepting a list of IDs in the desired order.
  Assigns position 0, 1, 2, ... to each ID in sequence.
  Ignores IDs that don't correspond to existing categories.
  """
  def reorder_categories(ordered_ids) when is_list(ordered_ids) do
    ordered_ids
    |> Enum.with_index()
    |> Enum.each(fn {id, idx} ->
      from(c in Category, where: c.id == ^id)
      |> Repo.update_all(set: [position: idx])
    end)

    :ok
  end

  # If position is not supplied, place the new category at the end.
  defp maybe_set_position(attrs) do
    if Map.has_key?(attrs, "position") or Map.has_key?(attrs, :position) do
      attrs
    else
      count = Repo.aggregate(Category, :count)
      Map.put(attrs, "position", count)
    end
  end
end
