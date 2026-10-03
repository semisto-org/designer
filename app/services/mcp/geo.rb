module Mcp
  # GeoJSON helpers for tool results.
  module Geo
    PRECISION = 7 # ~1 cm, plenty for a garden and lighter for the AI

    def self.round(geojson)
      case geojson
      when Hash then geojson.transform_values { |v| round(v) }
      when Array then geojson.map { |v| round(v) }
      when Float then geojson.round(PRECISION)
      else geojson
      end
    end

    def self.encode(geometry)
      geometry && round(RGeo::GeoJSON.encode(geometry))
    end

    # Number of positions in GeoJSON coordinates (nested arrays of numbers).
    def self.position_count(coordinates)
      return 0 unless coordinates.is_a?(Array)
      return 1 if coordinates.first.is_a?(Numeric)
      coordinates.sum { |c| position_count(c) }
    end

    def self.positions_in_range?(coordinates)
      return false unless coordinates.is_a?(Array)
      if coordinates.first.is_a?(Numeric)
        lng, lat = coordinates
        coordinates.size.between?(2, 3) && coordinates.all?(Numeric) && lng.between?(-180, 180) && lat.between?(-90, 90)
      else
        coordinates.any? && coordinates.all? { |c| positions_in_range?(c) }
      end
    end
  end
end
