module Providers
  class Geocoder
    # https://photon.komoot.io — OSM-based, fair use on the public instance,
    # or self-hosted (GEOCODER_URL).
    class Photon
      def initialize(url:, contact: nil)
        @url = url.chomp("/")
        @contact = contact
      end

      def search(query, region: nil)
        params = { q: query, limit: LIMIT * 2, lang: region&.locale || "fr" }
        if (bbox = Geocoder.region_bbox(region))
          params[:bbox] = bbox.join(",")
        end
        json = GeoHttp.get_json("#{@url}/api", params:, timeout: 6, breaker: false)
        country = region&.country_code&.upcase
        Array(json["features"]).filter_map do |feature|
          next unless feature.is_a?(Hash)
          props = feature["properties"].is_a?(Hash) ? feature["properties"] : {}
          next if country && props["countrycode"].present? && props["countrycode"].upcase != country
          result(feature, props)
        end
      end

      private
        def result(feature, props)
          lng, lat = Array(feature.dig("geometry", "coordinates")).map { |v| Float(v) }
          return nil unless lng && lat
          # Photon extent: [minLon, maxLat, maxLon, minLat].
          extent = Array(props["extent"]).map { |v| Float(v) }
          bbox = extent.size == 4 ? [ extent[0], extent[3], extent[2], extent[1] ] : nil
          street = [ props["street"], props["housenumber"] ].compact.join(" ").presence
          locality = [ props["postcode"], props["city"] || props["district"] ].compact.join(" ").presence
          label = [ street || props["name"], locality ].compact.uniq.join(", ").presence || props["name"].to_s
          detail = [ props["county"], props["state"] ].compact.uniq.join(", ").presence
          zoom = props["housenumber"].present? ? 18 : Geocoder.zoom_for(bbox)
          Result.new(label:, detail:, lng:, lat:, bbox:, zoom:)
        rescue ArgumentError, TypeError
          nil
        end
    end
  end
end
