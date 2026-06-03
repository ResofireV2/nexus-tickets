defmodule NexusTickets do
  @moduledoc """
  Nexus Support — product support ticket system.

  Stage 1: categories + admin panel.
  """

  use Nexus.Extensions.Behaviour

  @impl true
  def migrations do
    [
      NexusTickets.Migrations.V1CreateCategories
    ]
  end

  @impl true
  def routes do
    [{"/api", NexusTickets.ApiRouter, []}]
  end
end
