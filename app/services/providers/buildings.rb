# Building footprints around a map, for the 3D relief (clean extruded
# volumes instead of roofs melted into the terrain mesh), behind a small
# stable interface:
#
#   buildings = Providers::Buildings.build
#   buildings.available?                         # false when BUILDINGS_PROVIDER=none
#   buildings.within(south:, west:, north:, east:) # => [Building, ...]
#
# The footprints come from OpenStreetMap (ODbL) through the Overpass API.
# OSM is nearly complete on our regions: Wallonia (PICC import), Flanders
# (GRB), France (cadastre) and Luxembourg (ACT) were imported building by
# building. Heights are rarely tagged: the browser measures them on the
# region's surface model when there is one, and falls back to the tags here
# (`height`, `building:levels`) otherwise.
#
# Configured by ENV:
# - BUILDINGS_PROVIDER: overpass (default) | none
# - OVERPASS_URL: the interpreter endpoint (defaults to the public instance)
#
# The public Overpass asks for modest use: answers are cached a month per
# extent, and a page asks once per terrain version.
module Providers
  class Buildings
    class Unavailable < StandardError; end

    Building = Data.define(:id, :kind, :rings, :height, :min_height, :levels) do
      def as_json(*) = { id:, kind:, rings:, height:, minHeight: min_height, levels: }
    end

    DEFAULT_URL = "https://overpass-api.de/api/interpreter".freeze
    ATTRIBUTION = "© contributeurs OpenStreetMap (ODbL)".freeze
    CACHE_TTL = 30.days
    TIMEOUT = 40
    # Above this, a map is a city district, not a garden: refuse rather than
    # pull tens of thousands of buildings.
    MAX_AREA_KM2 = 25
    SKIPPED = %w[no construction proposed demolished razed abandoned].freeze

    def self.build(env = ENV)
      name = env.fetch("BUILDINGS_PROVIDER", "overpass").to_s.strip.downcase
      return new(nil) unless name == "overpass"

      new(env["OVERPASS_URL"].presence || DEFAULT_URL)
    end

    def initialize(url)
      @url = url
    end

    def available? = !@url.nil?

    def attribution = ATTRIBUTION

    def within(south:, west:, north:, east:)
      raise Unavailable, "not configured" unless available?

      box = [ south, west, north, east ].map { |v| v.to_f.round(5) }
      raise Unavailable, "extent too large" if area_km2(*box) > MAX_AREA_KM2

      key = [ "map_data/buildings/v1", Digest::SHA1.hexdigest(@url)[0, 8], *box ].join("/")
      rows = Rails.cache.fetch(key, expires_in: CACHE_TTL) { fetch(box).map(&:to_h) }
      rows.map { |row| Building.new(**row.symbolize_keys) }
    end

    private
      def fetch(box)
        bbox = box.join(",")
        query = <<~OVERPASS.squish
          [out:json][timeout:#{TIMEOUT - 5}];
          (way["building"](#{bbox});relation["building"]["type"="multipolygon"](#{bbox}););
          out geom qt;
        OVERPASS
        body = GeoHttp.get(@url, params: { data: query }, timeout: TIMEOUT).body
        JSON.parse(body).fetch("elements", []).filter_map { |element| parse(element) }
      rescue GeoHttp::Unavailable, JSON::ParserError, KeyError => e
        raise Unavailable, e.message
      end

      def parse(element)
        tags = element["tags"] || {}
        kind = tags["building"].to_s
        return nil if SKIPPED.include?(kind)

        rings = case element["type"]
        when "way" then [ ring(element["geometry"]) ]
        when "relation"
          # Only closed outer ways: stitching split rings is not worth it for
          # the handful of multipolygon buildings around a garden.
          (element["members"] || []).select { |m| m["role"] == "outer" }.map { |m| ring(m["geometry"]) }
        else []
        end.compact
        return nil if rings.empty?

        Building.new(
          id: "#{element["type"][0]}#{element["id"]}", kind:, rings:,
          height: metres(tags["height"]),
          min_height: metres(tags["min_height"]),
          levels: integer(tags["building:levels"])
        )
      end

      # A closed ring of at least three distinct points, [lng, lat] rounded to 7 decimals.
      def ring(geometry)
        points = Array(geometry).filter_map { |p| p && p["lon"] && [ p["lon"].to_f.round(7), p["lat"].to_f.round(7) ] }
        return nil if points.size < 4 || points.first != points.last

        points
      end

      # "12", "12 m", "12.5m" → 12.0; feet and nonsense → nil.
      def metres(value)
        match = value.to_s.strip.match(/\A(\d+(?:[.,]\d+)?)\s*(m)?\z/)
        number = match && match[1].tr(",", ".").to_f
        number if number&.between?(0.5, 400)
      end

      def integer(value)
        number = Integer(value.to_s.strip, exception: false)
        number if number&.between?(1, 120)
      end

      def area_km2(south, west, north, east)
        height = (north - south) * 111.32
        width = (east - west) * 111.32 * Math.cos((south + north) / 2 * Math::PI / 180)
        (height * width).abs
      end
  end
end
