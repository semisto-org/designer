module Relief
  # The cells of a grid whose centre lies inside a (multi)polygon, by
  # even-odd scanline filling: one pass per row over the ring edges, no
  # per-cell geometry test (a 1 m grid has a million cells).
  module Mask
    module_function

    # Returns a binary String of `extent.cells` bytes, "\x01" inside.
    def for_geometry(geometry, extent)
      mask = ("\x00" * extent.cells).b
      return mask unless geometry

      edges = rings_of(geometry).flat_map do |ring|
        points = ring.map { |lng, lat| extent.to_grid(lng, lat) }
        points.each_cons(2).map { |a, b| [ a, b ] }
      end
      extent.rows.times do |row|
        xs = []
        edges.each do |(x0, y0), (x1, y1)|
          next if y0 == y1
          next unless (row >= [ y0, y1 ].min) && (row < [ y0, y1 ].max)

          xs << x0 + (row - y0) * (x1 - x0) / (y1 - y0)
        end
        xs.sort!
        xs.each_slice(2) do |from, to|
          next unless to

          first = [ from.ceil, 0 ].max
          last = [ to.floor, extent.cols - 1 ].min
          next if last < first

          offset = row * extent.cols
          mask[(offset + first)..(offset + last)] = "\x01" * (last - first + 1)
        end
      end
      mask
    end

    def rings_of(geometry)
      case geometry.geometry_type
      when RGeo::Feature::MultiPolygon then geometry.each.flat_map { |polygon| rings_of(polygon) }
      when RGeo::Feature::Polygon
        [ geometry.exterior_ring, *geometry.interior_rings ].map { |ring| ring.points.map { |p| [ p.x, p.y ] } }
      else []
      end
    end
  end
end
