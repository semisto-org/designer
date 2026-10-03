# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
module Relief
  # A regular grid in EPSG:3857 around a map: one cell per `cell_size_m`
  # metres on the ground. The 3857 step is `cell_size_m / cos(lat0)` (the
  # Mercator scale factor), so the ortho exported in 3857 falls on the grid
  # pixel for pixel. `west`/`north` are the centre of the north-west cell;
  # rows run north → south, columns west → east.
  #
  # The margin feeds the slopes upstream: water running onto the terrain
  # comes partly from its neighbours, and a simulation cut at the boundary
  # would make it appear in the middle of a field.
  Extent = Data.define(:west, :north, :step, :cols, :rows, :lat0, :cell_size_m, :margin_m) do
    def self.around(bbox, cell_size_m:, margin_m:)
      min_lng, min_lat, max_lng, max_lat = bbox.map(&:to_f)
      lat0 = (min_lat + max_lat) / 2
      scale = 1 / Math.cos(lat0 * Math::PI / 180)
      step = cell_size_m * scale
      margin = margin_m * scale
      x0, y0 = Mercator.forward(min_lng, min_lat)
      x1, y1 = Mercator.forward(max_lng, max_lat)
      west = x0 - margin
      north = y1 + margin
      cols = (((x1 + margin) - west) / step).ceil + 1
      rows = ((north - (y0 - margin)) / step).ceil + 1
      new(west:, north:, step:, cols:, rows:, lat0:, cell_size_m: cell_size_m.to_f, margin_m: margin_m.to_f)
    end

    def east = west + (cols - 1) * step
    def south = north - (rows - 1) * step
    def cells = cols * rows

    # Ground size in metres (centre to centre).
    def width_m = (cols - 1) * cell_size_m
    def height_m = (rows - 1) * cell_size_m

    # Cell centre of a grid index, in EPSG:3857.
    def point(index)
      [ west + (index % cols) * step, north - (index / cols) * step ]
    end

    # Fractional [col, row] of a WGS84 position.
    def to_grid(lng, lat)
      x, y = Mercator.forward(lng, lat)
      [ (x - west) / step, (north - y) / step ]
    end

    # [min_lng, min_lat, max_lng, max_lat] of the cell centres.
    def bbox_wgs84
      min_lng, min_lat = Mercator.inverse(west, south)
      max_lng, max_lat = Mercator.inverse(east, north)
      [ min_lng, min_lat, max_lng, max_lat ]
    end

    def polygon_wgs84(factory = GeoJsonGeometry::FACTORY)
      min_lng, min_lat, max_lng, max_lat = bbox_wgs84
      ring = [ [ min_lng, min_lat ], [ max_lng, min_lat ], [ max_lng, max_lat ], [ min_lng, max_lat ], [ min_lng, min_lat ] ]
      factory.polygon(factory.linear_ring(ring.map { |lng, lat| factory.point(lng, lat) }))
    end

    def mercator_bbox
      [ west, south, east, north ]
    end
  end
end
