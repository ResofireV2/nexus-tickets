defmodule NexusTickets.Migrations.V3CreateReplies do
  use Ecto.Migration

  def change do
    create table(:nexus_tickets_replies) do
      add :ticket_id,          references(:nexus_tickets_tickets, on_delete: :delete_all), null: false
      add :user_id,            references(:users, on_delete: :nilify_all)
      add :edited_by_user_id,  references(:users, on_delete: :nilify_all)

      add :content,            :text,     null: false
      add :is_internal_note,   :boolean,  null: false, default: false
      add :edited_at,          :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:nexus_tickets_replies, [:ticket_id])
    create index(:nexus_tickets_replies, [:user_id])
  end
end
