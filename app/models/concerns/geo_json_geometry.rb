# GeoJSON in and out for an RGeo geometry column, plus measurements in
# meters computed by PostGIS on the geography type.
module GeoJsonGeometry
  extend ActiveSupport::Concern

  FACTORY = RGeo::Geos.factory(srid: 4326)

  class_methods do
    def parse_geojson(value)
      return nil if value.blank?
      value = value.to_unsafe_h if value.respond_to?(:to_unsafe_h)
      value = JSON.parse(value) if value.is_a?(String)
      RGeo::GeoJSON.decode(value.deep_stringify_keys, geo_factory: FACTORY)
    end
  end

  def geometry_geojson(attribute = :geometry)
    geom = public_send(attribute)
    geom && RGeo::GeoJSON.encode(geom)
  end

  # Area in m² and length in m, measured on the ellipsoid.
  def measure_geometry(attribute = :geometry)
    return {} if public_send(attribute).nil? || !persisted?
    sql = <<~SQL.squish
      SELECT ST_Area(#{attribute}::geography) AS area,
             ST_Length(#{attribute}::geography) AS length,
             ST_Perimeter(#{attribute}::geography) AS perimeter
      FROM #{self.class.table_name} WHERE id = $1
    SQL
    row = self.class.connection.select_one(sql, "measure", [ id ])
    row&.transform_values { |v| v.to_f.round(2) } || {}
  end
end
