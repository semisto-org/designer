module PermacultureZones
  # Zones 1 to 4 proposed from the house, as the editor's « Zones » panel
  # proposes them (app/frontend/map/zones/permaculture.ts, proposeZones):
  # each zone reaches REACH_M from the house's walls, and further along the
  # paths that leave it (one goes more often where one walks), cut to the
  # terrain, each ring without the zones inside it. A ring in several pieces
  # gives one polygon per piece, each one reshapable on its own. Zone 5, the
  # wild part, is chosen by the person, never computed.
  #
  #   PermacultureZones::Proposal.new(map, houses: [building]).call
  #   # => [{ number: 1, geometry: { "type" => "Polygon", ... }, area_m2: 1301.0 }, ...]
  class Proposal
    REACH_M = { 1 => 15, 2 => 40, 3 => 100, 4 => 250 }.freeze
    PATH_WIDTH_SHARE = 0.35
    PATH_KINDS = %w[path track path_existing].freeze
    # A piece of a ring smaller than this is a sliver left by a path's edge (MIN_PIECE_M2 in permaculture.ts).
    MIN_PIECE_M2 = 50
    # The same colours as PERMACULTURE_ZONE_COLORS in permaculture.ts.
    COLORS = { 0 => "#8b5e3c", 1 => "#e07b5f", 2 => "#e8b33a", 3 => "#a3bb8a", 4 => "#5f9a78", 5 => "#2f6b55" }.freeze

    def initialize(map, houses:)
      @map = map
      @houses = houses
    end

    def call
      return [] if @houses.empty? || @map.boundary.nil?

      inner = union_sql(MapFeature.where(id: @houses.map(&:id)))
      paths = union_sql(@map.features.active.where(kind: PATH_KINDS).where("ST_GeometryType(geometry) = 'ST_LineString'"))
      out = []
      REACH_M.each do |number, reach|
        row = connection.select_one(sanitize(<<~SQL, house: inner, paths:, reach:, near: reach * 1.5, width: reach * PATH_WIDTH_SHARE, boundary: boundary_json, inner:))
          WITH house AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:house), 4326) AS g),
          terrain AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:boundary), 4326)) AS g),
          reached AS (
            SELECT ST_Union(
              ST_Buffer((SELECT g FROM house)::geography, :reach)::geometry,
              COALESCE(ST_Intersection(
                ST_Buffer(ST_SetSRID(ST_GeomFromGeoJSON(:paths), 4326)::geography, :width)::geometry,
                ST_Buffer((SELECT g FROM house)::geography, :near)::geometry
              ), ST_GeomFromText('POLYGON EMPTY', 4326))
            ) AS g
          ), ring AS (
            SELECT ST_CollectionExtract(ST_Intersection(ST_Difference((SELECT g FROM reached), ST_SetSRID(ST_GeomFromGeoJSON(:inner), 4326)), (SELECT g FROM terrain)), 3) AS g
          )
          SELECT
            (SELECT json_agg(ST_AsGeoJSON(d.geom, 7)::json ORDER BY ST_Area(d.geom::geography) DESC) FROM ring, ST_Dump(ring.g) d WHERE ST_Area(d.geom::geography) >= #{MIN_PIECE_M2}) AS parts,
            (SELECT ST_Area(g::geography) FROM ring) AS area_m2,
            ST_AsGeoJSON(ST_Union((SELECT g FROM reached), ST_SetSRID(ST_GeomFromGeoJSON(:inner), 4326))) AS inner,
            ST_IsEmpty(ST_Difference((SELECT g FROM terrain), ST_Union((SELECT g FROM reached), ST_SetSRID(ST_GeomFromGeoJSON(:inner), 4326)))) AS covered
        SQL
        JSON.parse(row["parts"] || "[]").each { |geometry| out << { number:, geometry:, area_m2: row["area_m2"].to_f } }
        inner = row["inner"]
        break if row["covered"]
      end
      out
    end

    private
      def connection = MapFeature.connection

      def sanitize(sql, binds) = MapFeature.sanitize_sql([ sql, binds ])

      def boundary_json = RGeo::GeoJSON.encode(@map.boundary).to_json

      # The union of a scope's geometries as GeoJSON, or an empty collection.
      def union_sql(scope)
        json = scope.pick(Arel.sql("ST_AsGeoJSON(ST_Union(geometry))"))
        json || { type: "GeometryCollection", geometries: [] }.to_json
      end
  end
end
