# « Journal IA », a view of the project for the map's owner (« Carte ▾ »):
# the page; its entries come from Maps::AiActionsController.
module Maps
  class AiJournalsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_owner!

    def show
      render inertia: "maps/ai_journals/show", props: {
        map: { id: @map.id, name: @map.name, role: @role, teamId: @map.organization_id,
               offerBuilder: Offer.shown_to?(@map, Current.user), timeEntries: TimeEntry.tab_for?(@map, Current.user) }
      }
    end
  end
end
