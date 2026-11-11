module Mcp
  module Tools
    # An address or a place name → candidate points, through the same
    # geocoder as the editor's search (Providers::Geocoder): the region's
    # official register first where it has one (ICAR in Wallonia, the BAN in
    # France), OpenStreetMap after it. With a map or a territory, each
    # candidate says whether it falls inside, so a farm named by the press
    # lands on the right side of the commune line.
    class Geocode < Base
      include PlaceAccess

      arguments(
        properties: {
          address: { type: "string", minLength: Providers::Geocoder::MIN_LENGTH, maxLength: Providers::Geocoder::MAX_LENGTH, description: :address },
          map_id: { type: "integer", minimum: 1, description: :map_id },
          territory_id: { type: "integer", minimum: 1, description: :territory_id }
        },
        required: %w[address]
      )
      hints(open_world: true)

      def perform(address:, map_id: nil, territory_id: nil)
        place = find_place!(map_id, territory_id) if map_id || territory_id
        geocoder = Providers::Geocoder.build
        raise ToolError, t("errors.geocoder_off") unless geocoder.available?

        results = search(geocoder, address, place&.region)
        {
          address:, results: results.map { |r| result_json(r, place) },
          note: t(results.empty? ? "tools.geocode.nothing" : "tools.geocode.note")
        }
      rescue Providers::Geocoder::Unavailable
        raise ToolError, t("errors.geocoder_unavailable")
      end

      private
        # Without a place, the region is unknown: the first answer says where
        # the address is, and a region with its own register is asked again.
        def search(geocoder, address, region)
          results = geocoder.search(address, region:)
          return results if region || results.empty?

          found = Region.for_point(results.first.lng, results.first.lat)
          return results unless found && !found.europe? && found.setting("geocoder", "provider").present?

          geocoder.search(address, region: found).presence || results
        end

        def result_json(result, place)
          {
            label: result.label, detail: result.detail, point: [ result.lng, result.lat ], bbox: result.bbox,
            inside: (inside?(place, result) if place&.boundary),
            distance_m: (distance_m(place, result) if place&.boundary)
          }.compact
        end

        def inside?(place, result)
          place.class.where(id: place.id).where("ST_Contains(boundary, ST_SetSRID(ST_MakePoint(?, ?), 4326))", result.lng, result.lat).exists?
        end

        # From the outline, 0 inside.
        def distance_m(place, result)
          sql = place.class.sanitize_sql_array([ "ST_Distance(boundary::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography)", result.lng, result.lat ])
          place.class.where(id: place.id).pick(Arel.sql(sql)).to_f.round
        end

        def summarize_result(data) = { results: data[:results].size }
    end
  end
end
