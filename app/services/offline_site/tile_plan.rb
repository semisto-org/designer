# Which tiles of a region layer an offline site carries: the terrain and a
# margin around it, from a few zooms above the terrain's own view down to
# the layer's finest one, within a budget. Beyond the finest zoom carried,
# MapLibre enlarges the last tiles, so the plan stays readable up close.
module OfflineSite
  class TilePlan
    # About 20 MB of aerial photo per layer: a hectare reaches zoom 20.
    MAX_TILES = 1_200
    FINEST_ZOOM = 20
    # Context around the terrain, as a share of its size on each side.
    MARGIN = 0.3
    # The coarsest zoom shows the terrain and its surroundings.
    ZOOMS_ABOVE_FIT = 3
    MIN_ZOOM = 10
    # The coarsest zoom spans at least this many tiles across.
    FIT_TILES = 2

    attr_reader :bbox

    # bbox: [west, south, east, north] in WGS84.
    def initialize(bbox, min_zoom: nil, max_zoom: nil, budget: MAX_TILES)
      @bbox = padded(bbox)
      @min_zoom = min_zoom
      @max_zoom = max_zoom
      @budget = budget
    end

    # [[z, x, y], …], coarsest zoom first.
    def tiles = zooms.flat_map { |z| tiles_at(z) }

    # The zooms carried: from the coarsest to the finest that fits the budget.
    def zooms
      @zooms ||= begin
        first = [ fit_zoom - ZOOMS_ABOVE_FIT, MIN_ZOOM, @min_zoom || 0 ].max
        last = [ @max_zoom || FINEST_ZOOM, FINEST_ZOOM ].min
        total = 0
        (first..last).each_with_object([]) do |z, kept|
          count = count_at(z)
          break kept if total + count > @budget && kept.any?
          total += count
          kept << z
        end
      end
    end

    def max_zoom = zooms.last

    private
      def padded((west, south, east, north))
        dx = [ (east - west) * MARGIN, 0.001 ].max
        dy = [ (north - south) * MARGIN, 0.001 ].max
        [ west - dx, [ south - dy, -85 ].max, east + dx, [ north + dy, 85 ].min ]
      end

      # The zoom at which the padded terrain spans about FIT_TILES tiles.
      def fit_zoom
        span = [ bbox[2] - bbox[0], 1e-6 ].max
        (Math.log2(360.0 * FIT_TILES / span)).floor.clamp(0, FINEST_ZOOM)
      end

      def range_at(z)
        x0, y0 = tile_of(bbox[0], bbox[3], z)
        x1, y1 = tile_of(bbox[2], bbox[1], z)
        [ x0..x1, y0..y1 ]
      end

      def count_at(z)
        xs, ys = range_at(z)
        xs.size * ys.size
      end

      def tiles_at(z)
        xs, ys = range_at(z)
        xs.flat_map { |x| ys.map { |y| [ z, x, y ] } }
      end

      def tile_of(lng, lat, z)
        n = 2**z
        x = ((lng + 180.0) / 360.0 * n).floor.clamp(0, n - 1)
        rad = lat * Math::PI / 180.0
        y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math::PI) / 2 * n).floor.clamp(0, n - 1)
        [ x, y ]
      end
  end
end
