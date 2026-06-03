defmodule NexusTickets.Category do
  use Ecto.Schema
  import Ecto.Changeset

  schema "nexus_tickets_categories" do
    field :name,        :string
    field :slug,        :string
    field :description, :string
    field :color,       :string, default: "#5B4EF5"
    field :icon,        :string, default: "fa-tag"
    field :position,    :integer, default: 0

    timestamps(type: :utc_datetime)
  end

  def changeset(category, attrs) do
    category
    |> cast(attrs, [:name, :slug, :description, :color, :icon, :position])
    |> validate_required([:name, :slug])
    |> validate_length(:name, min: 1, max: 60)
    |> validate_length(:slug, min: 1, max: 60)
    |> validate_format(:slug, ~r/^[a-z0-9-]+$/,
        message: "only lowercase letters, numbers, and hyphens")
    |> validate_length(:description, max: 500)
    |> validate_format(:color, ~r/^#[0-9a-fA-F]{6}$/,
        message: "must be a hex color")
    |> validate_length(:icon, min: 1, max: 60)
    |> unique_constraint(:slug)
  end
end
