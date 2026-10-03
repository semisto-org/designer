# Esri JSON polygons (ArcGIS REST) to GeoJSON.
#
# Esri lists rings without saying which are holes: outer rings run
# clockwise, holes counter-clockwise (y up). Each hole goes to the outer
# ring that contains it. The result is always a GeoJSON MultiPolygon; PostGIS
# repairs any remaining invalidity (ST_MakeValid) when it is stored.
module Providers
  module EsriGeometry
    class Invalid < StandardError; end

    module_function

    def to_geojson(geometry)
      rings = Array(geometry.is_a?(Hash) ? geometry["rings"] : nil)
        .map { |ring| clean_ring(ring) }.compact
      raise Invalid, "no rings" if rings.empty?

      outers, holes = rings.partition { |ring| signed_area(ring) <= 0 }
      # A single counter-clockwise ring (some servers do not normalise):
      # treat everything as outer rings.
      outers, holes = holes, [] if outers.empty?
      polygons = outers.map { |ring| [ ring ] }
      holes.each do |hole|
        owner = polygons.find { |poly| contains?(poly.first, hole.first) }
        owner&.push(hole)
      end
      { "type" => "MultiPolygon", "coordinates" => polygons }
    end

    def clean_ring(ring)
      points = Array(ring).filter_map do |pt|
        next unless pt.is_a?(Array) && pt.size >= 2
        x, y = Float(pt[0]), Float(pt[1])
        [ x.round(8), y.round(8) ] if x.finite? && y.finite?
      rescue ArgumentError, TypeError
        nil
      end
      points << points.first if points.any? && points.first != points.last
      points.size >= 4 ? points : nil
    end

    # Shoelace: positive when counter-clockwise.
    def signed_area(ring)
      ring.each_cons(2).sum { |(x1, y1), (x2, y2)| (x1 * y2) - (x2 * y1) } / 2.0
    end

    def contains?(ring, (x, y))
      inside = false
      ring.each_cons(2) do |(x1, y1), (x2, y2)|
        next unless (y1 > y) != (y2 > y)
        inside = !inside if x < ((x2 - x1) * (y - y1) / (y2 - y1)) + x1
      end
      inside
    end
  end
end
