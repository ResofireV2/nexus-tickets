defmodule NexusTickets do
  @moduledoc """
  Nexus Support — product support ticket system.

  Stage 2: ticket creation, member index, ticket detail.
  """

  use Nexus.Extensions.Behaviour

  @impl true
  def migrations do
    [
      NexusTickets.Migrations.V1CreateCategories,
      NexusTickets.Migrations.V2CreateTickets,
      NexusTickets.Migrations.V3CreateReplies
    ]
  end

  @impl true
  def routes do
    [{"/", NexusTickets.ApiRouter, []}]
  end
end
