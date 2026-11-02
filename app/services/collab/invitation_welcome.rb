# What a person invited to a map sees before signing in (« invitations/welcome »)
# and once on the map (`welcome` in the map's props): this place, who invites
# them, what they will be able to do there, and since when the garden grows.
# Only the outline, the area and who invites: never the address or the parcels.
module Collab
  class InvitationWelcome
    def initialize(map, inviter:, role:, chat:)
      @map, @inviter, @role, @chat = map, inviter, role, chat
    end

    def as_json(*)
      plants = @map.features.active.where(layer: "plants")
      {
        mapId: @map.id,
        mapName: @map.name,
        boundary: @map.geometry_geojson(:boundary),
        areaM2: @map.area_m2,
        inviterName: @inviter&.display_name,
        role: @role,
        chat: @chat,
        since: @map.created_at.to_date.iso8601,
        plants: plants.count,
        plantsInGround: plants.where.not(MapFeature::PLANNED_SQL).count
      }
    end
  end
end
