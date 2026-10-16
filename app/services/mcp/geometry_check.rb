module Mcp
  # Checks a GeoJSON geometry an AI sends (a new draft, or a new position
  # for an element): positions in range, reasonable size, parseable, then,
  # for many at once in a single query, valid and lying within BUFFER_M of
  # the terrain boundary. Errors are the French reasons sent back to the AI.
  module GeometryCheck
    BUFFER_M = 200
    MAX_POSITIONS = 2000

    module_function

    def err(key, **options) = I18n.t("mcp.draft_errors.#{key}", **options)

    # The reason the geometry cannot be used, before asking the database.
    def static_error(geometry)
      geometry = geometry.to_h.deep_symbolize_keys if geometry.respond_to?(:to_h) && !geometry.is_a?(Array)
      return err(:geometry) unless geometry.is_a?(Hash) && geometry[:coordinates].is_a?(Array)
      return err(:coordinates) unless Geo.positions_in_range?(geometry[:coordinates])
      return err(:too_complex, max: MAX_POSITIONS) if Geo.position_count(geometry[:coordinates]) > MAX_POSITIONS
      err(:geometry) if parse(geometry).nil?
    end

    def parse(geometry)
      RGeo::GeoJSON.decode(geometry.to_h.deep_stringify_keys, geo_factory: GeoJsonGeometry::FACTORY)
    rescue StandardError
      nil
    end

    # One query for all geometries: validity and coverage by the terrain
    # boundary widened by BUFFER_M meters. Takes [[key, geometry], …] and
    # returns { key => error } for the ones that fail.
    def spatial_errors(map, pairs)
      return {} if pairs.empty?
      keys = pairs.map(&:first)
      payload = pairs.each_with_index.map { |(_, geometry), i| { i:, g: RGeo::GeoJSON.encode(parse(geometry)) } }
      sql = <<~SQL.squish
        WITH zone AS (SELECT ST_Buffer(boundary::geography, $2)::geometry AS area FROM maps WHERE id = $1),
        input AS (
          SELECT (value->>'i')::int AS idx, ST_SetSRID(ST_GeomFromGeoJSON(value->>'g'), 4326) AS geom
          FROM jsonb_array_elements($3::jsonb)
        )
        SELECT idx, ST_IsValid(geom) AS valid, ST_IsValidReason(geom) AS reason, ST_IsEmpty(geom) AS empty,
               CASE WHEN ST_IsValid(geom) THEN ST_CoveredBy(geom, zone.area) END AS inside
        FROM input, zone
      SQL
      rows = ActiveRecord::Base.connection.select_all(sql, "GeometryCheck", [ map.id, BUFFER_M, payload.to_json ])
      rows.each_with_object({}) do |row, errors|
        error =
          if row["empty"] then err(:empty)
          elsif !row["valid"] then err(:invalid, reason: row["reason"])
          elsif !row["inside"] then err(:outside, buffer: BUFFER_M)
          end
        errors[keys[row["idx"]]] = error if error
      end
    end
  end
end
