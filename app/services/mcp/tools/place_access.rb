module Mcp
  module Tools
    # A map or a territory (« Territoire », a whole commune): the tools that
    # read a place's region (its layers, its aerial photos, its relief) work
    # on either, given map_id or territory_id. A map and a territory both
    # answer region, boundary, center and bbox.
    module PlaceAccess
      include TerritoryAccess

      # How far beyond a territory's outline a point may lie: the stream just
      # across the commune line, the hill its water comes from.
      TERRITORY_MARGIN_M = 1000

      private
        def find_place!(map_id, territory_id)
          raise ToolError, t("errors.map_or_territory") if map_id.nil? == territory_id.nil?
          map_id ? find_map!(map_id) : find_territory!(territory_id)
        end

        def territory?(place) = place.is_a?(Territory)

        # Within `distance` metres of the place's outline (or of its center
        # when it has none yet).
        def near_place?(place, lng, lat, distance)
          reference = place.boundary ? "boundary" : (place.center ? "center" : nil)
          unless reference
            bounds = place.region&.bounds
            return bounds.nil? || bounds.contains?(GeoJsonGeometry::FACTORY.point(lng, lat))
          end
          place.class.where(id: place.id)
            .where("ST_DWithin(#{reference}::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)", lng, lat, distance)
            .exists?
        end

        def require_point_near!(place, lng, lat, map_distance)
          distance = territory?(place) ? TERRITORY_MARGIN_M : map_distance
          return if near_place?(place, lng, lat, distance)

          raise ToolError, t(territory?(place) ? "errors.point_outside_territory" : "errors.point_too_far", distance:)
        end

        # The region layers the place may read: a territory never reads the
        # sensitive ones (networks), which stay on the server.
        def place_layers(place)
          territory?(place) ? place.readable_layers : place.region.catalogue.enabled.to_a
        end

        def require_region!(place)
          place.region or raise ToolError, t("errors.no_region")
        end
    end
  end
end
