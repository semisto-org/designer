# Unions GeoJSON polygons into one clean MultiPolygon in SRID 4326, with
# PostGIS: repair (ST_MakeValid), snap to a ~1 cm grid so shared parcel
# edges merge, close slivers thinner than ~10 cm between neighbours (a
# tiny mitred buffer out and back), keep only the polygonal parts.
module Boundaries
  module GeometryUnion
    class Empty < StandardError; end

    # ~5 cm in degrees at our latitudes: closes cadastral slivers, keeps corners.
    SLIVER = 0.0000007

    module_function

    # geometries: GeoJSON hashes (Polygon / MultiPolygon). srid: of the input.
    def call(geometries, srid: 4326)
      return nil if geometries.empty?
      connection = ActiveRecord::Base.connection
      srid = Integer(srid)
      parts = geometries.map do |geometry|
        "ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(#{connection.quote(geometry.to_json)}), #{srid}), 4326)"
      end
      sql = <<~SQL.squish
        WITH input AS (
          SELECT ST_MakeValid(ST_SnapToGrid(ST_MakeValid(g), 0.0000001)) AS g
          FROM unnest(ARRAY[#{parts.join(", ")}]) AS g
        ), merged AS (
          SELECT ST_CollectionExtract(ST_MakeValid(ST_UnaryUnion(ST_Collect(g))), 3) AS g FROM input
        ), closed AS (
          SELECT ST_CollectionExtract(ST_MakeValid(
            ST_Buffer(ST_Buffer(g, #{SLIVER}, 'join=mitre mitre_limit=5'), -#{SLIVER}, 'join=mitre mitre_limit=5')
          ), 3) AS g FROM merged
        )
        SELECT ST_AsGeoJSON(ST_Multi(CASE WHEN ST_IsEmpty(closed.g) THEN merged.g ELSE closed.g END), 8)
        FROM closed, merged
      SQL
      json = connection.select_value(sql, "Boundaries::GeometryUnion")
      geojson = json && JSON.parse(json)
      raise Empty, "empty union" if geojson.nil? || Array(geojson["coordinates"]).empty?
      geojson
    rescue ActiveRecord::StatementInvalid => error
      raise Empty, error.message
    end
  end
end
