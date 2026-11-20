module Wind
  # Which hedge, windbreak or wall shelters each tree of a map from each of
  # its winds, for the tree's sheet in the editor (« À l'abri du vent ») and
  # for the AI (get_site_data, topic wind).
  #
  # The winds are the map's own wind sectors (« Secteurs » panel, accepted
  # ones), each with its directions; for a type the map has none of yet, the
  # observed climate's: the prevailing wind of the year and the cold wind of
  # spring, each over three directions (67.5°) around where it comes from.
  #
  # A shelter of height H protects what lies downwind of it up to SHELTER_REACH
  # × H (Semisto's design guide, chapter « structure »: a windbreak calms the
  # wind over about ten times its height). A tree is sheltered from a wind
  # when the nearest point of a shelter within that reach lies in the wind's
  # directions, seen from the tree. Distances are computed on a local flat
  # projection (metres), exact enough at the scale of a garden.
  #
  #   Wind::Shelter.new(map).for(feature)
  #   # => { winds: [{ type:, from_deg:, to_deg:, season:, source: "sector" | "climate", name:,
  #   #               shelter: { id:, name:, kind:, height_m:, distance_m:, reach_m: } | nil }] }
  class Shelter
    SHELTER_REACH = 10
    SHELTER_KINDS = { "windbreak" => 10.0, "hedge" => 3.0, "existing_hedge" => 2.0, "wall" => 1.0, "hedge_bank" => 2.0 }.freeze
    # The strata a wind can break, and that a hedge is planted to shelter.
    TREE_STRATA = %w[canopy sub_canopy shrub].freeze
    CLIMATE_HALF_WIDTH = 33.75
    # Under this share of spring hours, the cold spring wind is not worth a line.
    COLD_SPRING_MIN_PCT = 1.0
    METERS_PER_DEGREE = 111_320.0

    Exposure = Data.define(:type, :from_deg, :to_deg, :season, :source, :name)

    def initialize(map, climate: nil)
      @map = map
      @climate = climate
    end

    # The winds considered, sectors first.
    def winds
      @winds ||= begin
        sectors = @map.features.active.in_design.where(kind: "sector").select { %w[wind cold_wind].include?(_1.properties.to_h["sector_type"]) }
        own = sectors.filter_map do |feature|
          props = feature.properties.to_h
          from, to = Float(props["from_deg"], exception: false), Float(props["to_deg"], exception: false)
          next unless from && to
          Exposure.new(type: props["sector_type"], from_deg: from, to_deg: to, season: props["sector_season"].presence || "all_year", source: "sector", name: feature.name.presence)
        end
        types = own.map(&:type)
        own + climate_winds.reject { types.include?(_1.type) }
      end
    end

    # The shelter of one plant feature, or nil when it is not a tree or shrub.
    def for(feature)
      return nil unless tree?(feature)
      point = feature.geometry
      return nil unless point.respond_to?(:x)

      { winds: winds.map { |wind| wind.to_h.merge(shelter: shelter(point, wind)) } }
    end

    # Every tree of the map with the winds it is open to, for the AI.
    def trees(limit: 200)
      plants = @map.features.active.in_design.where(layer: "plants", kind: MapFeature::PLANT).to_a.select { tree?(_1) }
      labels = MapFeature.labels_for(plants)
      listed = plants.first(limit).map do |feature|
        result = self.for(feature)
        {
          id: feature.id, name: labels[feature.id],
          sheltered: result[:winds].select { _1[:shelter] }.map { { type: _1[:type], from_deg: _1[:from_deg], to_deg: _1[:to_deg], by: _1[:shelter][:name] || _1[:shelter][:kind], distance_m: _1[:shelter][:distance_m] } },
          exposed: result[:winds].reject { _1[:shelter] }.map { { type: _1[:type], from_deg: _1[:from_deg], to_deg: _1[:to_deg] } }
        }
      end
      { count: plants.size, listed: listed.size, trees: listed }
    end

    private
      def tree?(feature)
        return false unless feature.plant? && feature.geometry&.geometry_type&.type_name == "Point"
        strata = feature.properties.to_h["strata"].presence || species(feature)&.default_strata
        TREE_STRATA.include?(strata)
      end

      def species(feature)
        @species ||= {}
        id = feature.plant_species_id
        return nil unless id
        @species.fetch(id) { @species[id] = PlantSpecies.find_by(id:) }
      end

      def climate_winds
        rose = climate&.dig("wind")
        return [] unless rose.is_a?(Hash) && rose["year"].is_a?(Hash)

        winds = []
        if (deg = rose.dig("year", "prevailing_deg"))
          winds << around("wind", deg, "all_year")
        end
        cold = rose["cold_spring"]
        if cold.is_a?(Hash) && cold["prevailing_deg"] && cold["hours_pct"].to_f >= COLD_SPRING_MIN_PCT
          winds << around("cold_wind", cold["prevailing_deg"], "spring")
        end
        winds
      end

      def around(type, deg, season)
        Exposure.new(type:, from_deg: (deg - CLIMATE_HALF_WIDTH) % 360, to_deg: (deg + CLIMATE_HALF_WIDTH) % 360, season:, source: "climate", name: nil)
      end

      def climate
        @climate ||= ObservedClimate::MapReport.new(@map).record&.indicators || {}
      end

      def shelters
        @shelters ||= @map.features.active.in_design.where(kind: SHELTER_KINDS.keys).filter_map do |feature|
          lines = lines_of(feature.geometry)
          next if lines.empty?
          height = Float(feature.properties.to_h["height_m"], exception: false)
          height = SHELTER_KINDS[feature.kind] unless height&.positive?
          { feature:, lines:, height: }
        end
      end

      def lines_of(geometry)
        return [] unless geometry
        case geometry.geometry_type.type_name
        when "LineString" then [ geometry.points.map { [ _1.x, _1.y ] } ]
        when "MultiLineString" then geometry.each.map { |line| line.points.map { [ _1.x, _1.y ] } }
        else []
        end
      end

      def shelter(point, wind)
        origin = [ point.x, point.y ]
        best = nil
        shelters.each do |shelter|
          reach = shelter[:height] * SHELTER_REACH
          nearest = shelter[:lines].filter_map { nearest_on(origin, _1) }.min_by(&:first)
          next unless nearest
          distance, (east, north) = nearest
          next if distance > reach || distance < 0.5

          bearing = (Math.atan2(east, north) * 180 / Math::PI) % 360
          next unless within?(bearing, wind.from_deg, wind.to_deg)
          next if best && best[:distance_m] <= distance

          feature = shelter[:feature]
          best = { id: feature.id, name: feature.name.presence, kind: feature.kind, height_m: shelter[:height].round(1), distance_m: distance.round(1), reach_m: reach.round }
        end
        best
      end

      # [distance, [east, north]] in metres from `origin` to the nearest point of a polyline.
      def nearest_on(origin, coordinates)
        kx = Math.cos(origin[1] * Math::PI / 180)
        local = coordinates.map { [ (_1[0] - origin[0]) * METERS_PER_DEGREE * kx, (_1[1] - origin[1]) * METERS_PER_DEGREE ] }
        return nil if local.empty?
        return [ Math.hypot(*local.first), local.first ] if local.size == 1

        local.each_cons(2).map do |(ax, ay), (bx, by)|
          dx, dy = bx - ax, by - ay
          length = dx * dx + dy * dy
          t = length.zero? ? 0 : (-(ax * dx + ay * dy) / length).clamp(0, 1)
          x, y = ax + t * dx, ay + t * dy
          [ Math.hypot(x, y), [ x, y ] ]
        end.min_by(&:first)
      end

      def within?(bearing, from, to)
        span = (to - from) % 360
        span = 360 if span.zero?
        (bearing - from) % 360 <= span
      end
  end
end
