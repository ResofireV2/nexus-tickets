defmodule NexusTickets.Migrations.V1CreateCategories do
  use Ecto.Migration

  def change do
    create table(:nexus_tickets_categories) do
      add :name,        :string,  null: false
      add :slug,        :string,  null: false
      add :description, :text
      add :color,       :string,  null: false, default: "#5B4EF5"
      add :icon,        :string,  null: false, default: "fa-tag"
      add :position,    :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create unique_index(:nexus_tickets_categories, [:slug])
    create index(:nexus_tickets_categories, [:position])
  end
end
