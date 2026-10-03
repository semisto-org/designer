module Mcp
  module Tools
    class ListMaps < Base
      MAX = 200

      arguments(properties: {})
      hints

      def perform
        maps = Map.active.where(id: MapMembership.where(user:).select(:map_id))
          .or(Map.active.where(organization_id: OrganizationMembership.where(user:).select(:organization_id)))
          .includes(:region).order(updated_at: :desc).limit(MAX).to_a
        drafts = MapFeature.drafts.where(map_id: maps.map(&:id)).group(:map_id).count
        {
          maps: maps.map do |map|
            {
              id: map.id, name: map.name, role: map.role_for(user), stage: map.stage,
              region: { key: map.region.key, name: map.region.name },
              area_m2: map.area_m2, address: map.address, has_boundary: map.boundary.present?,
              drafts_pending: drafts.fetch(map.id, 0), updated_at: map.updated_at.iso8601, url: map_url(map)
            }
          end
        }
      end

      private
        def summarize_result(data) = { maps: data[:maps].size }
    end
  end
end
