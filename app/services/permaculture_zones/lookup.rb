module PermacultureZones
  # The permaculture zone (0 to 5, by how often one goes there) of each
  # element of a map, as the editor computes it
  # (app/frontend/map/zones/permaculture.ts, zoneOfFeature): the lowest
  # number among the active `permaculture_zone` polygons over the element,
  # 0 inside a building marked as the dwelling. An element stands where its
  # point does, inside a surface for a surface, halfway along a line.
  # Zones, notes and the dwellings themselves have none.
  #
  #   PermacultureZones::Lookup.new(map).for_features(features)
  #   # => { 12 => 1, 15 => 3 }
  class Lookup
    KIND = "permaculture_zone".freeze

    def initialize(map)
      @map = map
    end

    # Whether the map has any zone drawn (else elements have no zone to tell).
    def any?
      @any = @map.features.active.where(kind: KIND).exists? if @any.nil?
      @any
    end

    def for_features(features)
      ids = features.reject { |f| f.layer == "notes" || dwelling?(f) }.map(&:id)
      return {} if ids.empty? || !any?

      sql = <<~SQL
        WITH zones AS (
          SELECT geometry, (properties->>'zone_number')::int AS number
          FROM map_features
          WHERE map_id = :map_id AND kind = :kind AND status = 'active' AND properties->>'zone_number' ~ '^[0-5]$'
          UNION ALL
          SELECT geometry, 0 FROM map_features
          WHERE map_id = :map_id AND kind = 'building' AND status = 'active' AND properties->>'dwelling' = 'true'
        ), anchors AS (
          SELECT id, CASE
            WHEN ST_Dimension(geometry) = 0 THEN ST_PointOnSurface(geometry)
            WHEN ST_GeometryType(geometry) = 'ST_LineString' THEN ST_LineInterpolatePoint(geometry, 0.5)
            ELSE ST_PointOnSurface(geometry)
          END AS point
          FROM map_features WHERE id IN (:ids)
        )
        SELECT anchors.id, MIN(zones.number) AS number
        FROM anchors JOIN zones ON ST_Covers(zones.geometry, anchors.point)
        GROUP BY anchors.id
      SQL
      rows = MapFeature.connection.select_rows(MapFeature.sanitize_sql([ sql, { map_id: @map.id, kind: KIND, ids: } ]))
      rows.to_h { |id, number| [ id.to_i, number.to_i ] }
    end

    def for_feature(feature) = for_features([ feature ])[feature.id]

    private
      def dwelling?(feature) = feature.kind == "building" && feature.properties["dwelling"] == true
  end
end
