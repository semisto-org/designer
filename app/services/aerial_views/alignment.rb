# How to move a drone view so that it lines up with the map (« Recaler la
# vue »), from landmark pairs someone placed: a point seen on the drone view
# (`from`, a corner of a shed, a post) and where it really is (`to`, on the
# cadastre or the region's orthophoto), both [longitude, latitude].
#
# One pair moves the view; two or three also turn and scale it (the best
# similarity in the least-squares sense, in Web Mercator metres: the view's
# own projection, so straight lines stay straight). The browser computes the
# same transform for its preview (app/frontend/drone/alignment.ts).
#
# A drone without RTK is usually off by a few metres and a degree or two;
# what goes far beyond is a slip of the hand, refused with its reason
# (drone.align.errors.* in the interface).
module AerialViews
  class Alignment
    EARTH_RADIUS = 6_378_137.0
    MAX_PAIRS = 3
    # Ground metres any point of the view may move.
    MAX_SHIFT_M = 300
    MAX_ROTATION_DEG = 20
    MAX_SCALE_CHANGE = 0.2
    # Two landmarks closer than this cannot tell a rotation.
    MIN_SPREAD_M = 3

    class Invalid < StandardError
      attr_reader :code

      def initialize(code)
        @code = code
        super(code)
      end
    end

    attr_reader :pairs

    # `pairs`: [{ "from" => [lng, lat], "to" => [lng, lat] }, …]
    def initialize(pairs)
      @pairs = Array(pairs).map { |pair| normalize(pair) }
      raise Invalid.new("no_pairs") if @pairs.empty?
      raise Invalid.new("too_many_pairs") if @pairs.size > MAX_PAIRS
    end

    def self.mercator(lng, lat)
      rad = lat.clamp(-85.05, 85.05) * Math::PI / 180
      [ EARTH_RADIUS * lng * Math::PI / 180, EARTH_RADIUS * Math.log(Math.tan(Math::PI / 4 + rad / 2)) ]
    end

    def self.lng_lat(x, y)
      [ x / EARTH_RADIUS * 180 / Math::PI, (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math::PI / 2) * 180 / Math::PI ]
    end

    # x' = a·x − b·y + tx, y' = b·x + a·y + ty, in Web Mercator metres.
    def transform
      @transform ||= begin
        from = pairs.map { self.class.mercator(*_1[:from]) }
        to = pairs.map { self.class.mercator(*_1[:to]) }
        fx, fy = mean(from)
        tx, ty = mean(to)
        if pairs.size == 1
          a, b = 1.0, 0.0
        else
          spread = from.sum { |x, y| (x - fx)**2 + (y - fy)**2 }
          raise Invalid.new("too_close") if Math.sqrt(spread / pairs.size) * ground_factor(pairs.first[:from][1]) * 2 < MIN_SPREAD_M
          a = from.zip(to).sum { |(x, y), (u, v)| (x - fx) * (u - tx) + (y - fy) * (v - ty) } / spread
          b = from.zip(to).sum { |(x, y), (u, v)| (x - fx) * (v - ty) - (y - fy) * (u - tx) } / spread
        end
        { a:, b:, tx: tx - (a * fx - b * fy), ty: ty - (b * fx + a * fy) }
      end
    end

    def apply(x, y)
      t = transform
      [ t[:a] * x - t[:b] * y + t[:tx], t[:b] * x + t[:a] * y + t[:ty] ]
    end

    def rotation_deg = Math.atan2(transform[:b], transform[:a]) * 180 / Math::PI

    def scale = Math.hypot(transform[:a], transform[:b])

    # Refuses what no drone is that far off from, over the view's extent
    # ({ "west", "south", "east", "north" }).
    def check!(bounds)
      raise Invalid.new("too_distorted") if rotation_deg.abs > MAX_ROTATION_DEG || (scale - 1).abs > MAX_SCALE_CHANGE
      corners = bounds ? [ %w[west south], %w[west north], %w[east south], %w[east north] ].map { |lng, lat| [ bounds[lng], bounds[lat] ] } : []
      (corners + pairs.map { _1[:from] }).each do |lng, lat|
        x, y = self.class.mercator(lng, lat)
        u, v = apply(x, y)
        raise Invalid.new("too_far") if Math.hypot(u - x, v - y) * ground_factor(lat) > MAX_SHIFT_M
      end
      self
    end

    # Ground metres the view's centre moves, for the record.
    def shift_m(bounds)
      lng = (bounds["west"] + bounds["east"]) / 2
      lat = (bounds["south"] + bounds["north"]) / 2
      x, y = self.class.mercator(lng, lat)
      u, v = apply(x, y)
      (Math.hypot(u - x, v - y) * ground_factor(lat)).round(2)
    end

    # GDAL's geotransform [x0, dx, rx, y0, ry, dy] once the view is moved.
    def geo_transform(gt)
      x0, dx, rx, y0, ry, dy = gt
      t = transform
      nx0, ny0 = apply(x0, y0)
      [ nx0, t[:a] * dx - t[:b] * ry, t[:a] * rx - t[:b] * dy, ny0, t[:b] * dx + t[:a] * ry, t[:b] * rx + t[:a] * dy ]
    end

    private
      def normalize(pair)
        pair = pair.to_h.stringify_keys
        points = pair.values_at("from", "to").map { |point| Array(point).first(2).map { Float(_1) } }
        raise Invalid.new("bad_point") unless points.all? { |lng, lat| lng.to_f.between?(-180, 180) && lat.to_f.between?(-85, 85) && lat }
        { from: points[0], to: points[1] }
      rescue ArgumentError, TypeError
        raise Invalid.new("bad_point")
      end

      def mean(points) = [ points.sum(&:first) / points.size, points.sum(&:last) / points.size ]

      # Web Mercator metres are stretched by 1 / cos(latitude).
      def ground_factor(lat) = Math.cos(lat * Math::PI / 180)
  end
end
