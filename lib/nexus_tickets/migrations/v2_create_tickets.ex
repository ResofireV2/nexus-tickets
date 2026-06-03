defmodule NexusTickets.Migrations.V2CreateTickets do
  use Ecto.Migration

  def change do
    create table(:nexus_tickets_tickets) do
      add :category_id,        references(:nexus_tickets_categories, on_delete: :nilify_all)
      add :user_id,            references(:users, on_delete: :nilify_all)
      add :assigned_staff_id,  references(:users, on_delete: :nilify_all)

      add :subject,            :string,   null: false
      add :status,             :string,   null: false, default: "open"
      # status: open | in_progress | awaiting_user | resolved | closed

      add :last_reply_at,      :utc_datetime
      add :deleted_at,         :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:nexus_tickets_tickets, [:user_id])
    create index(:nexus_tickets_tickets, [:category_id])
    create index(:nexus_tickets_tickets, [:assigned_staff_id])
    create index(:nexus_tickets_tickets, [:status])
    create index(:nexus_tickets_tickets, [:deleted_at])
    create index(:nexus_tickets_tickets, [:inserted_at])
  end
end
