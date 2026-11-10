module Mcp
  module Tools
    # The territories of the user's teams (« Territoire »: a commune read
    # whole), with what their dossier holds and the drafts waiting.
    class ListTerritories < Base
      include TerritoryAccess

      arguments(properties: {})
      hints(read_only: true, idempotent: true)

      def perform
        territories = Territory.visible_to(user).includes(:organization, :region).order(updated_at: :desc).to_a
        {
          territories: territories.map do |territory|
            {
              id: territory.id, name: territory.name, team: territory.organization.name,
              area_km2: (territory.area_m2 / 1_000_000).round(1), region: territory.region&.name,
              archived: territory.archived?, editable: territory.editable_by?(user),
              dossier: territory.counts, url: territory_url(territory)
            }
          end,
          next_step: t("notes.territories")
        }
      end

      private
        def summarize_result(data) = { count: data[:territories].size }
    end
  end
end
