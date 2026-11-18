module Relief
  # Cut and fill of a graded terrace (`graded_terrace`, or a patio `terrace`
  # on a slope: a level plateau inside an outline) or of a profile swept
  # along a line (`graded_profile`: a bench
  # cut into the slope or a raised bank), on the map's terrain grid: the
  # designed surface, its side slopes down or up to the natural ground, and
  # the volumes taken out and brought in.
  #
  # The same algorithm reshapes the 3D relief in the browser
  # (app/frontend/relief/grading.ts): keep both in step.
  #
  #   Relief::Grading.new(terrain).call(feature)
  #   # => { "level_m" => 196.4, "cut_m3" => 12.5, "fill_m3" => 140.2, ... } or nil
  class Grading
    KINDS = %w[graded_terrace graded_profile terrace].freeze
    PLATEAU_KINDS = %w[graded_terrace terrace].freeze
    # Side slopes as a gradient (rise over run, %): 30 to 50 % is how Semisto's
    # designers build them in the field, 40 % by default. The uphill talus
    # (cut) and the downhill one (fill) are set apart; `slope_ratio`
    # (horizontal metres per metre of height) is the older single value.
    SLOPE_PCT_DEFAULT = 40.0
    BENCH_WIDTH_DEFAULT = 3.0
    BANK_WIDTH_DEFAULT = 1.0
    BANK_HEIGHT_DEFAULT = 0.8
    MAX_TALUS_M = 12.0

    def initialize(terrain, heights: nil)
      @terrain = terrain
      @raw = heights
    end

    # The grading of a feature, or nil without a usable shape or ground under it.
    def call(feature)
      return nil unless KINDS.include?(feature.kind)

      load_grid
      props = feature.properties.to_h
      design = design_for(feature.kind, props, feature.geometry)
      design && grade(design)
    end

    private
      def design_for(kind, props, geometry)
        ratio = { cut: talus_ratio(props, "cut_slope_pct"), fill: talus_ratio(props, "fill_slope_pct") }
        if PLATEAU_KINDS.include?(kind)
          return nil unless geometry.respond_to?(:exterior_ring)

          ring = geometry.exterior_ring.points.map { |p| to_grid(p.x, p.y) }
          hinge = props["hinge"].to_s
          { shape: "plateau", outline: ring.first(ring.size - 1), ratio:,
            level: hinge == "level" ? number(props["level_m"]) : nil,
            hinge: %w[upper lower].include?(hinge) ? hinge : "middle" }
        else
          return nil unless geometry.respond_to?(:points) && !geometry.respond_to?(:exterior_ring)

          mode = props["level_mode"].presence || "follow"
          shape = props["shape"] == "bank" ? "bank" : "bench"
          { shape:, outline: geometry.points.map { |p| to_grid(p.x, p.y) }, ratio:,
            width: positive(props["width_m"], shape == "bank" ? BANK_WIDTH_DEFAULT : BENCH_WIDTH_DEFAULT),
            height: positive(props["height_m"], BANK_HEIGHT_DEFAULT),
            level: mode == "follow" ? nil : number(props["level_m"]),
            grade: mode == "grade" ? (number(props["grade_pct"]) || 0.0) : nil }
        end
      end

      def grade(design)
        outline = design[:outline]
        plateau = design[:shape] == "plateau"
        return nil if plateau ? outline.size < 3 : outline.size < 2

        cs = @cell
        half_width = plateau ? 0.0 : design[:width] / 2
        xs = outline.map(&:first)
        ys = outline.map(&:last)
        margin = half_width + MAX_TALUS_M
        c0 = [ ((xs.min - margin) / cs).floor, 0 ].max
        c1 = [ ((xs.max + margin) / cs).ceil, @cols - 1 ].min
        r0 = [ ((ys.min - margin) / cs).floor, 0 ].max
        r1 = [ ((ys.max + margin) / cs).ceil, @rows - 1 ].min
        return nil if c0 > c1 || r0 > r1

        level = nil
        if plateau
          level = design[:level]
          unless level
            inside = []
            (r0..r1).each { |r| (c0..c1).each { |c| g = ground(r, c); inside << g if g && inside?(c * cs, r * cs, outline) } }
            return nil if inside.empty?

            level = case design[:hinge]
            when "upper" then inside.max
            when "lower" then inside.min
            else inside.sum / inside.size
            end
          end
        end
        start = bilinear(*outline.first)
        return nil if start.nil? && !plateau

        line_level = lambda do |along, px, py|
          if design[:grade] then (design[:level] || start) - design[:grade] / 100.0 * along
          elsif design[:level] then design[:level]
          else bilinear(px, py)
          end
        end

        area = cs * cs
        out = { cut: 0.0, fill: 0.0, cut_area: 0.0, fill_area: 0.0, max_cut: 0.0, max_fill: 0.0 }
        (r0..r1).each do |r|
          (c0..c1).each do |c|
            g = ground(r, c)
            next unless g

            x = c * cs
            y = r * cs
            target =
              if plateau
                distance, = nearest(outline, x, y, true)
                inside?(x, y, outline) ? level : talus(level, g, distance, design[:ratio])
              else
                distance, along, px, py = nearest(outline, x, y, false)
                beyond = [ distance - half_width, 0.0 ].max
                next if beyond > MAX_TALUS_M

                base = line_level.(along, px, py)
                next unless base

                if design[:shape] == "bench"
                  distance <= half_width ? base : talus(base, g, beyond, design[:ratio])
                else
                  crest = design[:level] && !design[:grade] ? design[:level] : base + design[:height]
                  [ g, crest - beyond / design[:ratio][:fill] ].max
                end
              end
            delta = target - g
            next if delta.abs < 1e-6

            if delta.positive?
              out[:fill] += delta * area
              out[:fill_area] += area
              out[:max_fill] = [ out[:max_fill], delta ].max
            else
              out[:cut] -= delta * area
              out[:cut_area] += area
              out[:max_cut] = [ out[:max_cut], -delta ].max
            end
          end
        end

        daylight = daylight_lines(design, level, half_width, line_level)
        level = design[:grade] || design[:level] ? (design[:level] || start) : nil if design[:shape] == "bench"
        {
          "level_m" => level&.round(2),
          "cut_m3" => out[:cut].round(1), "fill_m3" => out[:fill].round(1),
          "cut_area_m2" => out[:cut_area].round, "fill_area_m2" => out[:fill_area].round,
          "max_cut_m" => out[:max_cut].round(2), "max_fill_m" => out[:max_fill].round(2),
          "cell_size_m" => cs.round(2),
          "daylight" => daylight
        }.compact
      end

      DAYLIGHT_SPACING_M = 1.0
      DAYLIGHT_STEP_M = 0.2

      # Where the talus meet the natural ground, to stake out in the field:
      # the top of the cut talus uphill (`cut_top`) and the toe of the fill
      # talus downhill (`fill_toe`), each a list of lines in [lng, lat]. The
      # designed edges themselves are the drawn shape (plateau) or the strip
      # on each side of the line (bench, bank). Walked outward from the edge,
      # every metre, along its normal: a sketch for stakes, not a survey.
      def daylight_lines(design, level, half_width, line_level)
        samples = edge_samples(design, half_width, line_level, level)
        return nil if samples.empty?

        runs = { "cut" => [], "fill" => [] }
        kind_now = nil
        line = []
        flush = lambda do
          runs[kind_now] << line if kind_now && line.size >= 2
          kind_now = nil
          line = []
        end
        results = samples.map { |sample| sample && daylight_at(*sample, design) }
        # Around a closed outline, start where the kind changes, so a talus
        # that runs across the first corner stays one line.
        if design[:shape] == "plateau"
          turn = results.each_index.find { |i| results[i]&.first != results[0]&.first }
          results = results.rotate(turn) if turn
        end
        results.each do |result|
          kind, point = result
          # A gap (between two sides, nodata, the hinge where the edge meets the ground) ends the line.
          next flush.() unless kind

          flush.() if kind != kind_now
          kind_now = kind
          line << point
        end
        flush.()
        lines = runs.transform_values { |list| list.map { |line| line.map { |x, y| to_lnglat(x, y) } } }
        { "cut_top" => lines["cut"], "fill_toe" => lines["fill"] }.reject { |_, v| v.empty? }.presence
      end

      # [x, y, nx, ny, level, kind] along each designed edge, the normal
      # pointing away from the work; nil between two separate edges.
      def edge_samples(design, half_width, line_level, level)
        outline = design[:outline]
        if design[:shape] == "plateau"
          plateau_samples(outline, level)
        else
          centre = densify(outline)
          [ 1, -1 ].flat_map do |side|
            centre.filter_map do |x, y, tx, ty, along|
              base = line_level.(along, x, y)
              next unless base

              nx = -ty * side
              ny = tx * side
              crest = design[:shape] == "bank" ? (design[:level] && !design[:grade] ? design[:level] : base + design[:height]) : base
              [ x + nx * half_width, y + ny * half_width, nx, ny, crest, design[:shape] == "bank" ? :crest : :edge ]
            end + [ nil ]
          end
        end
      end

      # Each side of the outline with its outward normal and, around a convex
      # corner, a fan of normals: the talus turns the corner like a cone.
      def plateau_samples(outline, level)
        ring = outline + [ outline.first ]
        sides = ring.each_cons(2).filter_map do |(ax, ay), (bx, by)|
          length = Math.hypot(bx - ax, by - ay)
          next if length.zero?

          tx = (bx - ax) / length
          ty = (by - ay) / length
          nx, ny = ty, -tx
          mx = (ax + bx) / 2
          my = (ay + by) / 2
          nx, ny = -nx, -ny if inside?(mx + nx * 0.05, my + ny * 0.05, outline)
          [ ax, ay, tx, ty, nx, ny, length ]
        end
        sides.each_with_index.flat_map do |(ax, ay, tx, ty, nx, ny, length), k|
          steps = [ (length / DAYLIGHT_SPACING_M).ceil, 1 ].max
          along = (0...steps).map { |i| d = length * i / steps; [ ax + tx * d, ay + ty * d, nx, ny, level, :edge ] }
          _, _, tx2, ty2, nx2, ny2, = sides[(k + 1) % sides.size]
          turn = Math.atan2(nx * ny2 - ny * nx2, nx * nx2 + ny * ny2)
          # Convex when the next side turns away from this side's outward normal.
          convex = tx2 * nx + ty2 * ny < -1e-6 && turn.abs > 0.05
          bx = ax + tx * length
          by = ay + ty * length
          fan = convex ? (0..4).map { |i| a = turn * i / 4.0; [ bx, by, nx * Math.cos(a) - ny * Math.sin(a), nx * Math.sin(a) + ny * Math.cos(a), level, :edge ] } : []
          along + fan
        end
      end

      # Points every DAYLIGHT_SPACING_M along a polyline: [x, y, tx, ty, along].
      def densify(points)
        out = []
        walked = 0.0
        points.each_cons(2) do |(ax, ay), (bx, by)|
          length = Math.hypot(bx - ax, by - ay)
          next if length.zero?

          tx = (bx - ax) / length
          ty = (by - ay) / length
          steps = [ (length / DAYLIGHT_SPACING_M).ceil, 1 ].max
          steps.times { |k| d = length * k / steps; out << [ ax + tx * d, ay + ty * d, tx, ty, walked + d ] }
          walked += length
        end
        last = points.last
        out << [ last[0], last[1], *out.last[2, 2], walked ] if out.any?
        out
      end

      # ["cut" | "fill", [x, y]] where the talus leaving this edge point meets the ground.
      def daylight_at(x, y, nx, ny, level, kind, design)
        g0 = bilinear(x, y)
        return nil unless g0 && level
        return nil if kind == :edge && (g0 - level).abs < 0.05

        cut = kind == :edge && g0 > level
        ratio = cut ? design[:ratio][:cut] : design[:ratio][:fill]
        d = 0.0
        while d <= MAX_TALUS_M
          px = x + nx * d
          py = y + ny * d
          g = bilinear(px, py)
          return nil unless g

          surface = cut ? level + d / ratio : level - d / ratio
          return [ cut ? "cut" : "fill", [ px, py ] ] if cut ? surface >= g : surface <= g

          d += DAYLIGHT_STEP_M
        end
        nil
      end

      def to_lnglat(x, y)
        mx = @terrain.west + x / @cell * @terrain.step
        my = @terrain.north - y / @cell * @terrain.step
        Mercator.inverse(mx, my).map { |v| v.round(7) }
      end

      # Horizontal metres per metre of height of one talus.
      def talus_ratio(props, key)
        pct = number(props[key])
        return 100.0 / pct.clamp(5.0, 200.0) if pct&.positive?

        legacy = number(props["slope_ratio"])
        legacy&.positive? ? legacy : 100.0 / SLOPE_PCT_DEFAULT
      end

      # A cut talus climbs to the ground above the level, a fill talus falls to it.
      def talus(level, g, distance, ratio)
        g > level ? [ g, level + distance / ratio[:cut] ].min : [ g, level - distance / ratio[:fill] ].max
      end

      def inside?(x, y, ring)
        result = false
        j = ring.size - 1
        ring.each_with_index do |(ax, ay), k|
          bx, by = ring[j]
          result = !result if (ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax
          j = k
        end
        result
      end

      # [distance, along, px, py] of the nearest point of the polyline.
      def nearest(points, x, y, closed)
        best = [ Float::INFINITY, 0.0, x, y ]
        walked = 0.0
        count = closed ? points.size : points.size - 1
        count.times do |k|
          ax, ay = points[k]
          bx, by = points[(k + 1) % points.size]
          dx = bx - ax
          dy = by - ay
          length2 = dx * dx + dy * dy
          length = Math.sqrt(length2)
          t = length2.zero? ? 0.0 : (((x - ax) * dx + (y - ay) * dy) / length2).clamp(0.0, 1.0)
          px = ax + t * dx
          py = ay + t * dy
          distance = Math.hypot(x - px, y - py)
          best = [ distance, walked + t * length, px, py ] if distance < best[0]
          walked += length
        end
        best
      end

      def ground(r, c)
        v = @raw[r * @cols + c]
        v.nil? || v == @nodata ? nil : @z_min + v * @z_unit
      end

      def bilinear(x, y)
        fx = (x / @cell).clamp(0, @cols - 1.001)
        fy = (y / @cell).clamp(0, @rows - 1.001)
        c = fx.floor
        r = fy.floor
        tx = fx - c
        ty = fy - r
        corners = [ [ r, c, (1 - tx) * (1 - ty) ], [ r, c + 1, tx * (1 - ty) ], [ r + 1, c, (1 - tx) * ty ], [ r + 1, c + 1, tx * ty ] ]
        known = corners.filter_map { |rr, cc, w| (g = ground(rr, cc)) && [ g, w ] }
        return nil if known.empty?

        weight = known.sum(&:last)
        weight.positive? ? known.sum { |g, w| g * w } / weight : known.first.first
      end

      def to_grid(lng, lat)
        mx, my = Mercator.forward(lng.to_f, lat.to_f)
        [ (mx - @terrain.west) / @terrain.step * @cell, (@terrain.north - my) / @terrain.step * @cell ]
      end

      def number(value)
        n = value.is_a?(String) ? Float(value.tr(",", "."), exception: false) : value
        n.is_a?(Numeric) && n.finite? ? n.to_f : nil
      end

      def positive(value, fallback)
        n = number(value)
        n&.positive? ? n : fallback
      end

      def load_grid
        return if @cols

        @raw ||= @terrain.grid.download.unpack("v*")
        @cols = @terrain.cols
        @rows = @terrain.rows
        @nodata = @terrain.nodata || Raster::NODATA
        @z_min = @terrain.z_min.to_f
        @z_unit = (@terrain.z_unit || Raster::Z_UNIT).to_f
        @cell = @terrain.cell_size_m.to_f
      end
  end
end
