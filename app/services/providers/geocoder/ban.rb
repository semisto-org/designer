module Providers
  class Geocoder
    # France's national address base (Base Adresse Nationale), served by the
    # IGN Géoplateforme: https://data.geopf.fr/geocodage — open (Etalab 2.0),
    # no key, every house number. OpenStreetMap misses many French house
    # numbers (Clémence's test, October 2026), so a region whose settings say
    # `geocoder.provider = ban` asks it first.
    #
    # Results only cover France: `min_score` keeps an address from elsewhere
    # from matching a French namesake, and `house_numbers_only` keeps only
    # exact addresses when the place is not known to be in France.
    class Ban
      URL = "https://data.geopf.fr/geocodage".freeze
      ZOOM = { "housenumber" => 19, "street" => 17, "locality" => 16, "municipality" => 14 }.freeze

      def initialize(url: URL, min_score: 0.4, house_numbers_only: false)
        @url = url.chomp("/")
        @min_score = min_score
        @house_numbers_only = house_numbers_only
      end

      def search(query, region: nil)
        data = GeoHttp.get_json("#{@url}/search", params: { q: query, limit: LIMIT, index: "address" }, timeout: 5, breaker: false)
        Array(data.is_a?(Hash) ? data["features"] : nil).filter_map { |feature| result(feature) }
      end

      private
        def result(feature)
          props = feature.is_a?(Hash) && feature["properties"]
          return unless props.is_a?(Hash)
          return if props["score"].to_f < @min_score
          return if @house_numbers_only && props["type"] != "housenumber"
          lng, lat = Array(feature.dig("geometry", "coordinates")).map { |v| Float(v) }
          return unless lng && lat
          locality = [ props["postcode"], props["city"] ].compact.join(" ")
          label = [ props["name"].presence, locality.presence ].compact.uniq.join(", ").presence || props["label"].to_s
          detail = props["context"].to_s.split(",").drop(1).map(&:strip).uniq.join(", ").presence
          Result.new(label:, detail:, lng:, lat:, bbox: nil, zoom: ZOOM.fetch(props["type"], 18))
        rescue ArgumentError, TypeError
          nil
        end
    end
  end
end
