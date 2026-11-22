module Relief
  # « Coupe dans le temps »: a vertical cut through the land along a line the
  # person draws, as a designer draws a section on the board. The ground's
  # profile from the map's terrain (flat without one), the plants standing
  # within a corridor on either side of the line with their size today and at
  # years 5, 15 and 30 of the time strip (the growth of the 3D view, never a
  # second one), and the design elements the line crosses (a swale, a path, a
  # pond, a bank), each placed by its distance along the line.
  #
  # Moments follow the time strip: « today » is today's date, « yearN » is N
  # years after the first planting (GrowingPlants#origin).
  class Section
    MOMENTS = { "today" => nil, "year5" => 5, "year15" => 15, "year30" => 30 }.freeze
    CORRIDOR_M = 6
    MAX_CORRIDOR_M = 30
    MAX_LENGTH_M = 600
    MAX_SAMPLES = 300
    PLANT_LIMIT = 200
    CROSSING_LIMIT = 40
    # What the section names along the line; never networks (sensitive), notes or plants (drawn as plants).
    CROSSING_LAYERS = %w[existing water access structures animals drawings].freeze
    M_PER_DEG = 111_320.0
    HEDGE_KINDS = %w[hedge windbreak existing_hedge hedge_bank].freeze
    # A hedge with no height noted: what it is kept at once grown (m), and the years it takes.
    HEDGE_HEIGHT = { "windbreak" => 8.0, "hedge" => 3.0, "existing_hedge" => 3.0, "hedge_bank" => 3.0 }.freeze
    HEDGE_MATURITY = 8

    class Error < StandardError
      attr_reader :key

      def initialize(key)
        @key = key
        super(I18n.t("section.errors.#{key}"))
      end
    end

    attr_reader :length_m

    # `line`: [[lng, lat], …], two points or more.
    def initialize(map, line:, corridor_m: CORRIDOR_M, growing: nil)
      @map = map
      @line = Array(line).map { |p| [ Float(p[0]), Float(p[1]) ] }
      raise Error, :line unless @line.all? { |lng, lat| lng.finite? && lat.finite? && lng.abs <= 180 && lat.abs <= 90 }

      # Two clicks on the same spot make a segment of no length: keep one.
      @line = @line.chunk_while { _1 == _2 }.map(&:first)
      raise Error, :line if @line.size < 2
      @corridor = corridor_m.to_f.clamp(0.5, MAX_CORRIDOR_M)
      @lat0 = @line.sum { _1[1] } / @line.size
      @kx = M_PER_DEG * Math.cos(@lat0 * Math::PI / 180)
      @xy = @line.map { |lng, lat| [ lng * @kx, lat * M_PER_DEG ] }
      @cumulative = @xy.each_cons(2).reduce([ 0.0 ]) { |acc, (a, b)| acc << acc.last + Math.hypot(b[0] - a[0], b[1] - a[1]) }
      @length_m = @cumulative.last
      raise Error, :line if @length_m < 1
      raise Error, :too_long if @length_m > MAX_LENGTH_M
      @growing = growing
    rescue ArgumentError, TypeError
      raise Error, :line
    end

    def as_json(*)
      growing = @growing || GrowingPlants.new(@map).as_json
      origin = Date.iso8601(growing[:origin])
      {
        line: @line, lengthM: @length_m.round(1), corridorM: @corridor,
        origin: growing[:origin],
        moments: MOMENTS.map { |key, years| { key:, year: years, calendarYear: (years ? origin.next_year(years) : Date.current).year } },
        relief: heights ? "terrain" : "flat",
        reliefLocked: (true if relief_locked?),
        ground:, plants: plants(growing, origin), crossings: crossings(origin),
        bearing: bearing.round
      }.compact
    end

    private
      def heights
        return @heights if defined?(@heights)

        # The relief is an analysis: it follows the map's plan, like the relief panel.
        @heights = terrain_ready? && Entitlements.for_map(@map).analyses? ? Heights.new(@map.terrain) : nil
      end

      def terrain_ready?
        terrain = @map.terrain
        terrain&.ready? && terrain.grid.attached?
      end

      # The terrain is there but the plan does not cover analyses: the section is drawn flat.
      def relief_locked? = heights.nil? && terrain_ready?

      # The ground every few metres: [{ d:, z: }] (z nil where the terrain has no data; all nil when flat).
      def ground
        @ground ||= begin
          cell = @map.terrain&.cell_size_m.to_f
          step = [ cell.positive? ? cell / 2 : 1.0, @length_m / MAX_SAMPLES ].max
          count = (@length_m / step).ceil
          (0..count).map do |i|
            d = [ i * step, @length_m ].min
            lng, lat = point_at(d)
            { d: d.round(2), z: heights&.at(lng, lat)&.round(2) }
          end
        end
      end

      def ground_at(d)
        return nil unless heights

        lng, lat = point_at(d)
        heights.at(lng, lat)&.round(2)
      end

      # The plants of the design and the trees already there within the
      # corridor, nearest the line first when there are too many.
      def plants(growing, origin)
        today = Date.current
        near = growing[:plants].filter_map do |plant|
          d, offset = locate(plant[:lng], plant[:lat])
          next if d.nil? || offset.abs > @corridor

          [ plant, d, offset ]
        end
        near.sort_by { |_, _, offset| offset.abs }.first(PLANT_LIMIT).sort_by { _2 }.map do |plant, d, offset|
          sizes = MOMENTS.to_h do |key, years|
            size = GrowingPlants.size_at(plant, target: years ? origin.next_year(years) : today, today:)
            [ key, size && { h: size[:height].round(2), s: size[:spread].round(2) } ]
          end
          {
            id: plant[:id], name: plant[:ownName] || plant[:name], latinName: plant[:latinName],
            code: plant[:latinName] && MasterPlan.code(plant[:latinName]),
            strata: plant[:strata], existing: plant[:existing] || nil, foliage: plant[:foliage].presence,
            planted: (plant[:plantedOn].present? || plant[:plantedLongAgo]) || nil,
            d: d.round(2), offset: offset.round(2), z: ground_at(d),
            adult: { h: plant[:heightM].to_f.round(1), s: plant[:spreadM].to_f.round(1) },
            indicative: plant[:indicative] || nil,
            sizes:
          }.compact
        end
      end

      # What the line crosses (or passes beside, within the corridor), from where to where along it.
      def crossings(origin)
        geojson = { type: "LineString", coordinates: @line }.to_json
        line = MapFeature.sanitize_sql_array([ "ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)", geojson ])
        near = MapFeature.sanitize_sql_array([ "ST_DWithin(geometry::geography, #{line}::geography, ?)", @corridor ])
        shape = "CASE WHEN ST_Intersects(geometry, #{line}) THEN ST_Intersection(geometry, #{line}) ELSE ST_ClosestPoint(geometry, #{line}) END"
        rows = @map.features.active.in_design.where(layer: CROSSING_LAYERS)
          .where.not(kind: [ MapFeature::PLANT, PlantPalette::EXISTING_KIND, "bubble" ])
          .where(Arel.sql(near))
          .order(Arel.sql("ST_Distance(geometry::geography, #{line}::geography)")).limit(CROSSING_LIMIT * 2)
          # ST_Points: a line grazing an edge or crossing a multipolygon gives a collection, read as its points.
          .pluck(:id, :layer, :kind, :name, :properties, Arel.sql("ST_AsGeoJSON(ST_Points(#{shape}))"))
        rows.filter_map do |id, layer, kind, name, properties, shape_json|
          coords = flatten(JSON.parse(shape_json.to_s)["coordinates"]) rescue []
          spots = coords.filter_map { |lng, lat| locate(lng, lat, clamp: true)&.first }
          next if spots.empty?

          from, to = spots.minmax
          props = properties.to_h
          {
            id:, layer:, kind:, name: name.presence,
            planned: props["planned"] == true || nil,
            from: from.round(2), to: to.round(2),
            # Noted on the element (Terres panel): how wide and deep it is dug.
            widthM: positive(props["width_m"]), depthM: positive(props["depth_m"]),
            hedge: (hedge_sizes(kind, props, origin) if HEDGE_KINDS.include?(kind))
          }.compact
        end.sort_by { _1[:from] }.first(CROSSING_LIMIT)
      end

      # A hedge's height at each moment: noted on it, else its kind's; a
      # planned one grows from its planting (today) like a shrub row.
      def hedge_sizes(kind, props, origin)
        adult = positive(props["height_m"]) || HEDGE_HEIGHT.fetch(kind, 3.0)
        planted = props["planned"] != true
        MOMENTS.to_h do |key, years|
          target = years ? origin.next_year(years) : Date.current
          age = planted ? HEDGE_MATURITY : (target - Date.current) / 365.25
          [ key, (adult * (0.15 + 0.85 * PlantGrowth::Curve.share(age.to_f, HEDGE_MATURITY))).round(2) ]
        end
      end

      def positive(value)
        number = Float(value, exception: false)
        number if number&.positive?
      end

      def flatten(coords)
        return [] unless coords.is_a?(Array)
        return [ coords ] if coords.first.is_a?(Numeric)

        coords.flat_map { flatten(_1) }
      end

      # [distance along the line, signed offset (left of the line positive)],
      # or nil when the point projects beyond its ends (unless clamped).
      def locate(lng, lat, clamp: false)
        x = lng.to_f * @kx
        y = lat.to_f * M_PER_DEG
        best = nil
        @xy.each_cons(2).with_index do |(a, b), i|
          dx = b[0] - a[0]
          dy = b[1] - a[1]
          len2 = dx * dx + dy * dy
          next if len2.zero?

          t = ((x - a[0]) * dx + (y - a[1]) * dy) / len2
          tc = t.clamp(0.0, 1.0)
          px = a[0] + tc * dx
          py = a[1] + tc * dy
          distance = Math.hypot(x - px, y - py)
          side = (dx * (y - a[1]) - dy * (x - a[0])) >= 0 ? 1 : -1
          candidate = { distance:, d: @cumulative[i] + tc * Math.sqrt(len2), offset: side * distance, i:, t: }
          best = candidate if best.nil? || candidate[:distance] < best[:distance]
        end
        return nil unless best
        # Beyond the ends: the nearest spot is the line's very start or end, and the point lies past it.
        return nil if !clamp && ((best[:i].zero? && best[:t] < -1e-9) || (best[:i] == @xy.size - 2 && best[:t] > 1 + 1e-9))

        [ best[:d], best[:offset] ]
      end

      def point_at(d)
        i = @cumulative.each_cons(2).find_index { |a, b| d <= b } || (@cumulative.size - 2)
        span = @cumulative[i + 1] - @cumulative[i]
        t = span.zero? ? 0 : (d - @cumulative[i]) / span
        a = @line[i]
        b = @line[i + 1]
        [ a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t ]
      end

      # Which way the section looks along (degrees from north, start to end).
      def bearing
        a = @xy.first
        b = @xy.last
        (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math::PI + 360) % 360
      end
  end
end
