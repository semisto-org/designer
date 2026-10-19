module Trials
  # The first reading of a tried place (« Et chez toi ? »): which way the
  # land slopes and how much, where rain water runs to, and how big it is.
  # A coarse grid of heights over the parcel (or a square around the
  # address) and the plane that fits them best: enough for one honest
  # sentence, not a survey. The words are the page's (trials.fr.yml); this
  # returns the numbers.
  class Reading
    GRID = 7
    # Around an address without a parcel: a square of this side, in metres.
    SQUARE_M = 60.0
    # Below this, the land is called flat (in %).
    FLAT_PCT = 1.5
    COMPASS = %w[n ne e se s sw w nw].freeze
    # What an elevation service may raise when it is down or answers badly.
    ERRORS = [
      Providers::GeoHttp::Error, Providers::ArcgisElevation::Error, Providers::GeopfAltimetry::Error,
      Providers::CopernicusDem::Error, Providers::PhotoTexture::Error, Faraday::Error, Timeout::Error, JSON::ParserError
    ].freeze

    def initialize(trial, provider: Providers::Elevation.for(trial.region))
      @trial = trial
      @provider = provider
    end

    # { "area_m2", "slope_pct", "downhill" (compass key), "drop_m",
    #   "low_point" [lng, lat], "low_side" (compass key or nil) }; only the
    # area when the region has no relief or it cannot be reached.
    def call
      out = { "area_m2" => @trial.area_m2&.round }
      return out.compact unless @provider

      heights = sample
      return out.compact if heights.size < 6

      out.merge(fit(heights)).compact
    rescue *ERRORS => error
      Rails.logger.info("[trials] reading unavailable: #{error.message}")
      out.compact
    end

    private
      def bbox
        @trial.bbox || begin
          lng, lat = @trial.center.x, @trial.center.y
          dlat = SQUARE_M / 2 / 110_540
          dlng = SQUARE_M / 2 / (111_320 * Math.cos(lat * Math::PI / 180))
          [ lng - dlng, lat - dlat, lng + dlng, lat + dlat ]
        end
      end

      def extent
        @extent ||= begin
          min_lng, min_lat, max_lng, max_lat = bbox
          lat0 = (min_lat + max_lat) / 2
          width = (max_lng - min_lng) * 111_320 * Math.cos(lat0 * Math::PI / 180)
          height = (max_lat - min_lat) * 110_540
          cell = ([ width, height ].max / (GRID - 1)).clamp(2.0, 200.0)
          Relief::Extent.around(bbox, cell_size_m: cell, margin_m: 0)
        end
      end

      # [[lng, lat, x_m, y_m, z]] for the grid points inside the outline
      # (all of them when too few fall inside a thin parcel).
      def sample
        points = (0...extent.cells).map { |i| extent.point(i) }
        values = points.each_slice(@provider.chunk_size).flat_map { |chunk| @provider.sample(:terrain, chunk, extent) }
        rows = points.zip(values).filter_map do |(x, y), z|
          next if z.nil?
          lng, lat = Relief::Mercator.inverse(x, y)
          # Ground metres east and north of the north-west corner.
          [ lng, lat, (x - extent.west) / extent.step * extent.cell_size_m, (y - extent.north) / extent.step * extent.cell_size_m, z.to_f ]
        end
        inside = rows.select { |lng, lat, *| covers?(lng, lat) }
        inside.size >= 6 ? inside : rows
      end

      def covers?(lng, lat)
        boundary = @trial.boundary
        boundary.nil? || boundary.contains?(GeoJsonGeometry::FACTORY.point(lng, lat))
      end

      # Least squares plane z = a + b·x + c·y; (b, c) points uphill.
      def fit(rows)
        n = rows.size.to_f
        mx = rows.sum { _1[2] } / n
        my = rows.sum { _1[3] } / n
        mz = rows.sum { _1[4] } / n
        sxx = rows.sum { (_1[2] - mx)**2 }
        syy = rows.sum { (_1[3] - my)**2 }
        sxy = rows.sum { (_1[2] - mx) * (_1[3] - my) }
        sxz = rows.sum { (_1[2] - mx) * (_1[4] - mz) }
        syz = rows.sum { (_1[3] - my) * (_1[4] - mz) }
        det = sxx * syy - sxy**2
        return {} if det.abs < 1e-9

        b = (sxz * syy - syz * sxy) / det
        c = (syz * sxx - sxz * sxy) / det
        slope = Math.hypot(b, c) * 100
        low = rows.min_by { _1[4] }
        high = rows.max_by { _1[4] }
        {
          "slope_pct" => slope.round(1),
          "downhill" => slope < FLAT_PCT ? nil : compass(-b, -c),
          "drop_m" => (high[4] - low[4]).round(1),
          "low_point" => [ low[0].round(6), low[1].round(6) ],
          "low_side" => low_side(rows, mx, my)
        }
      end

      # Where the low part of the place lies from its middle (the lowest
      # fifth of the points), when it is clearly on one side.
      def low_side(rows, mx, my)
        low = rows.min_by([ (rows.size / 5.0).ceil, 2 ].max) { _1[4] }
        dx = low.sum { _1[2] } / low.size - mx
        dy = low.sum { _1[3] } / low.size - my
        Math.hypot(dx, dy) < extent.cell_size_m ? nil : compass(dx, dy)
      end

      # 8-point compass key of a vector (east, north).
      def compass(east, north)
        angle = (Math.atan2(east, north) * 180 / Math::PI) % 360
        COMPASS[((angle + 22.5) / 45).floor % 8]
      end
  end
end
