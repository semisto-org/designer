module Providers
  class Geocoder
    # https://nominatim.org/release-docs/latest/api/Search/ — usage policy:
    # identify the app (User-Agent, contact), max 1 request/s, no
    # autocomplete on the public server.
    class Nominatim
      THROTTLE_KEY = "map_data/geocode/nominatim-throttle".freeze

      def initialize(url:, contact: nil)
        @url = url.chomp("/")
        @contact = contact
      end

      def search(query, region: nil)
        throttle!
        params = { q: query, format: "jsonv2", addressdetails: 1, limit: LIMIT, "accept-language": region&.locale || "fr" }
        params[:countrycodes] = region.country_code.downcase if region&.country_code.present?
        if (bbox = Geocoder.region_bbox(region))
          params[:viewbox] = bbox.join(",")
          params[:bounded] = 1
        end
        params[:email] = @contact if @contact
        rows = GeoHttp.get_json("#{@url}/search", params:, headers: { "User-Agent" => user_agent }, timeout: 6, breaker: false)
        Array(rows).filter_map { |row| result(row) if row.is_a?(Hash) }
      end

      private
        def user_agent
          [ GeoHttp::USER_AGENT, @contact && "contact: #{@contact}" ].compact.join(" ")
        end

        def throttle!
          return if Rails.cache.write(THROTTLE_KEY, 1, unless_exist: true, expires_in: 1.second)
          sleep 1
          Rails.cache.write(THROTTLE_KEY, 1, expires_in: 1.second)
        end

        def result(row)
          lng, lat = Float(row["lon"]), Float(row["lat"])
          south, north, west, east = Array(row["boundingbox"]).map { |v| Float(v) }
          bbox = west && [ west, south, east, north ]
          address = row["address"].is_a?(Hash) ? row["address"] : {}
          Result.new(label: label(row, address), detail: detail(address), lng:, lat:, bbox:, zoom: Geocoder.zoom_for(bbox))
        rescue ArgumentError, TypeError
          nil
        end

        def label(row, address)
          street = [ address["road"] || address["pedestrian"] || address["hamlet"], address["house_number"] ].compact.join(" ").presence
          place = address["village"] || address["town"] || address["city"] || address["municipality"]
          locality = [ address["postcode"], place ].compact.join(" ").presence
          parts = [ street || row["name"].presence, locality ].compact.uniq
          parts.any? ? parts.join(", ") : row["display_name"].to_s.split(",").first(2).join(",").strip
        end

        def detail(address)
          [ address["county"], address["state"] ].compact.uniq.join(", ").presence
        end
    end
  end
end
