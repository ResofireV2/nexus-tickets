defmodule NexusTickets.Ticket do
  use Ecto.Schema
  import Ecto.Changeset

  @statuses ~w(open in_progress awaiting_user resolved closed)

  schema "nexus_tickets_tickets" do
    field :subject,           :string
    field :status,            :string, default: "open"
    field :last_reply_at,     :utc_datetime
    field :deleted_at,        :utc_datetime

    belongs_to :category,       NexusTickets.Category
    belongs_to :user,           Nexus.Accounts.User
    belongs_to :assigned_staff, Nexus.Accounts.User, foreign_key: :assigned_staff_id

    has_many :replies, NexusTickets.Reply

    timestamps(type: :utc_datetime)
  end

  def changeset(ticket, attrs) do
    ticket
    |> cast(attrs, [:subject, :status, :category_id, :user_id, :assigned_staff_id,
                    :last_reply_at, :deleted_at])
    |> validate_required([:subject])
    |> validate_length(:subject, min: 1, max: 255)
    |> validate_inclusion(:status, @statuses)
  end

  def statuses, do: @statuses
end
