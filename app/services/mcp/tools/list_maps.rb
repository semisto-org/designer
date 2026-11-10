module Mcp
  module Tools
    class ListMaps < Base
      MAX = 200

      arguments(properties: {})
      hints

      def perform
        maps = Map.active.where(id: MapMembership.where(user:).select(:map_id))
          .or(Map.active.where(organization_id: OrganizationMembership.where(user:).select(:organization_id)))
          .includes(:region, :board_section).order(updated_at: :desc).limit(MAX).to_a
        drafts = MapFeature.drafts.where(map_id: maps.map(&:id)).group(:map_id).count
        {
          maps: maps.map do |map|
            {
              id: map.id, name: map.name, role: map.role_for(user), stage: map.stage,
              region: { key: map.region.key, name: map.region.name },
              area_m2: map.area_m2, address: map.address, has_boundary: map.boundary.present?,
              drafts_pending: drafts.fetch(map.id, 0), updated_at: map.updated_at.iso8601, url: map_url(map),
              team_board: team_board(map)
            }.compact
          end
        }
      end

      private
        # A team project's column on the team board and the team's section
        # of it (« Pré-design »…), so a whole board reads in one call. nil off
        # a team or for its own places.
        def team_board(map)
          return nil unless map.organization_id && !map.own_place
          { stage: map.board_phase, section: map.board_section&.name, on_hold: map.on_hold?, closed: map.closed? }
        end

        def summarize_result(data) = { maps: data[:maps].size }
    end
  end
end
