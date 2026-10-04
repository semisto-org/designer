module Providers
  module Climate
    # A WGS84 location. Accepts an RGeo point, [lng, lat] or { lng:, lat: }.
    Point = Data.define(:lng, :lat) do
      def self.from(value)
        case value
        when Point then value
        when nil then nil
        when Array then build(value[0], value[1])
        when Hash then build(value[:lng] || value["lng"], value[:lat] || value["lat"])
        else value.respond_to?(:x) && value.respond_to?(:y) ? build(value.x, value.y) : nil
        end
      end

      def self.build(lng, lat)
        lng = Float(lng, exception: false)
        lat = Float(lat, exception: false)
        return nil unless lng && lat && lng.between?(-180, 180) && lat.between?(-90, 90)
        new(lng:, lat:)
      end

      # Cache key at ~1 km (2 decimals) by default: nearby maps share entries
      # and the exact location never ends up in a key.
      def cache_key(precision = 2) = "#{lat.round(precision)},#{lng.round(precision)}"

      def to_rgeo = GeoJsonGeometry::FACTORY.point(lng, lat)
    end
  end
end
