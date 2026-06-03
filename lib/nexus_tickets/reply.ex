defmodule NexusTickets.Reply do
  use Ecto.Schema
  import Ecto.Changeset

  schema "nexus_tickets_replies" do
    field :content,          :string
    field :is_internal_note, :boolean, default: false
    field :edited_at,        :utc_datetime

    belongs_to :ticket,          NexusTickets.Ticket
    belongs_to :user,            Nexus.Accounts.User
    belongs_to :edited_by_user,  Nexus.Accounts.User, foreign_key: :edited_by_user_id

    timestamps(type: :utc_datetime)
  end

  def changeset(reply, attrs) do
    reply
    |> cast(attrs, [:content, :is_internal_note, :ticket_id, :user_id,
                    :edited_at, :edited_by_user_id])
    |> validate_required([:content, :ticket_id])
    |> validate_length(:content, min: 1, max: 50_000)
  end
end
