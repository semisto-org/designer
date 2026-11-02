module Maps
  # « Ce que les cartes ne savent pas »: the three things « Ta première heure »
  # sends the person outside to see, read from what the map already holds
  # (no table of its own):
  #
  # - water: where the water goes after rain, seen once (a downpour noted, or
  #   a puddle or a waterlogged patch in the season notebook);
  # - season: one sign of the season noted on the land (frost that lingers,
  #   snow that melts first, budburst…);
  # - living: three wild plants photographed or noted as bio-indicators
  #   (accepted observations, plus photos still waiting to be read).
  #
  # A mission is done as soon as its observation exists, whenever it was
  # made. The card shows them for WINDOW after « Voici ton lieu » was opened;
  # the AI always reads them through get_map.
  class FirstHourMissions
    KEYS = %w[water season living].freeze
    WATER_SIGNS = %w[puddle waterlogged].freeze
    PLANTS_TARGET = 3
    WINDOW = 30.days

    # Signs worth going out for, month by month (as in the phone's carnet des saisons).
    SIGNS_BY_MONTH = {
      1 => %w[frost_pocket snow_melts_first animal_tracks], 2 => %w[frost_pocket first_flowers amphibians],
      3 => %w[budburst first_flowers frost_pocket], 4 => %w[budburst last_frost nest],
      5 => %w[last_frost pollinators nest], 6 => %w[summer_shade dries_first pollinators],
      7 => %w[summer_shade dries_first pollinators], 8 => %w[dries_first summer_shade wild_fruit],
      9 => %w[morning_mist wild_fruit browsing], 10 => %w[first_frost leaf_fall morning_mist],
      11 => %w[first_frost frost_pocket leaf_fall], 12 => %w[frost_pocket snow_melts_first winter_sun]
    }.freeze

    def initialize(map, now: Time.current)
      @map = map
      @now = now
    end

    def missions
      @missions ||= [ water, season, living ]
    end

    def done? = missions.all? { |mission| mission[:done] }

    # Shown in the editor while the first weeks last.
    def shown?
      started = @map.first_hour_started_at
      started.present? && started > @now - WINDOW
    end

    def as_json(*)
      { missions:, done: done?, shown: shown?, signs: SIGNS_BY_MONTH[@now.month] }
    end

    private
      def water
        storms = features.where(kind: MapFeature::StormObservation::STORM_KIND).count
        puddles = features.where(kind: MapFeature::SeasonSign::SIGN_KIND).where("properties->>'sign' IN (?)", WATER_SIGNS).count
        count = storms + puddles
        { key: "water", done: count.positive?, count: }
      end

      def season
        count = features.where(kind: MapFeature::SeasonSign::SIGN_KIND)
          .where("COALESCE(properties->>'sign', '') NOT IN (?)", WATER_SIGNS).count
        { key: "season", done: count.positive?, count: }
      end

      def living
        noted = @map.bioindicator_observations.active.count
        waiting = @map.photos.for_bioindicators.where.missing(:bioindicator_observations).count
        count = noted + waiting
        { key: "living", done: count >= PLANTS_TARGET, count:, target: PLANTS_TARGET }
      end

      def features = @map.features.active
  end
end
