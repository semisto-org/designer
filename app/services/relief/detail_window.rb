module Relief
  # A fine window of a territory's relief: 5 m cells over a square of
  # SIZE_M around a point, imported on demand beside the coarse relief of the
  # whole commune. Coarse cells (30 m) follow water from one valley to the
  # next; a window shows the axes it takes along a street or across a field.
  #
  # Windows sit on a fixed grid of TILE_M tiles in EPSG:3857 metres (about
  # 515 m on the ground at 50°N): a point falls in one tile, the window is
  # that tile and RADIUS tiles around it, so neighbouring questions share
  # one import. At 50°N a window is 2.6 km wide, ~265,000 cells at 5 m:
  # under FlowGrid::MAX_CELLS (no averaging), and about fifty SPW requests
  # of CHUNK points.
  class DetailWindow
    CELL_SIZE_M = 5.0
    TILE_M = 800.0
    RADIUS = 2
    CHUNK = 5_000

    attr_reader :tx, :ty

    def self.for_point(lng, lat)
      x, y = Mercator.forward(lng.to_f, lat.to_f)
      new((x / TILE_M).floor, (y / TILE_M).floor)
    end

    def self.from_key(key)
      tx, ty = key.to_s.split(":").map(&:to_i)
      new(tx, ty)
    end

    def initialize(tx, ty)
      @tx = tx
      @ty = ty
    end

    def key = "#{tx}:#{ty}"

    # [min_lng, min_lat, max_lng, max_lat] of the window.
    def bbox
      min_lng, min_lat = Mercator.inverse((tx - RADIUS) * TILE_M, (ty - RADIUS) * TILE_M)
      max_lng, max_lat = Mercator.inverse((tx + RADIUS + 1) * TILE_M, (ty + RADIUS + 1) * TILE_M)
      [ min_lng, min_lat, max_lng, max_lat ]
    end

    def extent = Extent.around(bbox, cell_size_m: CELL_SIZE_M, margin_m: 0)
  end
end
