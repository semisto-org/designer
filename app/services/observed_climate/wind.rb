class ObservedClimate
  # Where the wind comes from at a place, over thirty years of hourly 10 m
  # wind (HourlySeries#each_wind_hour), as wind roses a gardener reads:
  # the whole year and each season, the cold wind of spring that burns the
  # blossom, and the strongest winds. Plain Ruby, no I/O.
  #
  # Definitions:
  # - 16 directions of 22.5°, from north clockwise; a direction is where
  #   the wind blows FROM (a « west wind » comes from the west);
  # - calm: under CALM_MS, counted apart (no direction);
  # - seasons are meteorological: winter = December to February, spring =
  #   March to May (the flowering of fruit trees), summer = June to August,
  #   autumn = September to November;
  # - the cold spring wind: spring hours colder than COLD_C with at least
  #   COLD_WIND_MS of wind, the dry « bise » that burns open flowers and
  #   young leaves. Its share is of all spring hours;
  # - the strongest winds: the STRONG_PERCENTILE windiest hours of the
  #   period, where the storms come from. ERA5-Land has no gusts, and its
  #   hourly wind is smoother than what one feels: the threshold says how
  #   strong « strong » is here, not a storm's peak.
  #
  # Every share is a percentage of the period's hours, rounded to 0.1.
  # Each direction also gives its hours by speed class (km/h, CLASSES_KMH
  # as upper bounds), for a rose whose petals show calm and strong winds.
  #
  # ERA5-Land does not compute the 10 m wind itself: it takes ERA5's
  # (a ~31 km grid) and interpolates it to its 9 km cells, with no help from
  # the relief. The roses give the region's wind, not the deflection by a
  # valley, a hedge or a barn: the report says so.
  class Wind
    DIRECTIONS = 16
    STEP = 360.0 / DIRECTIONS
    CALM_MS = 0.5
    COLD_C = 5.0
    COLD_WIND_MS = 2.0
    STRONG_PERCENTILE = 0.98
    CLASSES_KMH = [ 10, 20, 30 ].freeze
    SEASONS = { winter: [ 12, 1, 2 ], spring: [ 3, 4, 5 ], summer: [ 6, 7, 8 ], autumn: [ 9, 10, 11 ] }.freeze
    # North to east, the directions of the cold « bise » in north-western Europe.
    NORTH_EAST = (0..4)
    MIN_HOURS = 24 * 30

    def self.direction(from_deg) = ((from_deg + STEP / 2) / STEP).floor % DIRECTIONS

    def initialize(hours)
      @hours = hours
    end

    def as_json(*)
      hours = @hours.to_a
      return nil if hours.size < MIN_HOURS

      spring = hours.select { SEASONS[:spring].include?(_1.month) }
      threshold = percentile(hours.map(&:speed), STRONG_PERCENTILE)
      {
        hours: hours.size,
        directions: DIRECTIONS,
        classes_kmh: CLASSES_KMH,
        year: rose(hours),
        seasons: SEASONS.to_h { |season, months| [ season, rose(hours.select { months.include?(_1.month) }) ] },
        cold_spring: cold_spring(spring),
        strong: strong(hours, threshold)
      }
    end

    private
      def rose(hours)
        return nil if hours.empty?

        moving = hours.reject { _1.speed < CALM_MS }
        counts = Array.new(DIRECTIONS) { Array.new(CLASSES_KMH.size + 1, 0) }
        speeds = Array.new(DIRECTIONS, 0.0)
        moving.each do |hour|
          index = self.class.direction(hour.from_deg)
          counts[index][speed_class(hour.speed)] += 1
          speeds[index] += hour.speed
        end
        total = hours.size.to_f
        sectors = counts.each_with_index.map do |classes, index|
          n = classes.sum
          {
            deg: (index * STEP).round(1),
            pct: pct(n, total),
            mean_kmh: n.zero? ? nil : kmh(speeds[index] / n),
            classes: classes.map { pct(_1, total) }
          }
        end
        {
          hours: hours.size,
          calm_pct: pct(hours.size - moving.size, total),
          mean_kmh: kmh(hours.sum(&:speed) / total),
          prevailing_deg: prevailing(sectors),
          sectors:
        }
      end

      def cold_spring(spring)
        return nil if spring.empty?

        cold = spring.select { _1.temp_c && _1.temp_c < COLD_C && _1.speed >= COLD_WIND_MS }
        shares = shares(cold)
        {
          cold_c: COLD_C,
          min_kmh: kmh(COLD_WIND_MS),
          hours_pct: pct(cold.size, spring.size),
          prevailing_deg: cold.empty? ? nil : prevailing(shares),
          north_east_pct: cold.empty? ? 0.0 : pct(cold.count { NORTH_EAST.cover?(self.class.direction(_1.from_deg)) }, cold.size),
          sectors: shares
        }
      end

      def strong(hours, threshold)
        windy = hours.select { _1.speed >= threshold }
        shares = shares(windy)
        {
          percentile: (STRONG_PERCENTILE * 100).round,
          threshold_kmh: kmh(threshold),
          max_kmh: kmh(hours.map(&:speed).max),
          prevailing_deg: windy.empty? ? nil : prevailing(shares),
          sectors: shares
        }
      end

      # The share of `hours` coming from each direction (sums to 100).
      def shares(hours)
        counts = Array.new(DIRECTIONS, 0)
        hours.each { counts[self.class.direction(_1.from_deg)] += 1 }
        counts.each_with_index.map { |n, index| { deg: (index * STEP).round(1), pct: pct(n, hours.size) } }
      end

      def prevailing(sectors) = sectors.max_by { _1[:pct] }[:deg]

      def speed_class(speed_ms)
        CLASSES_KMH.index { speed_ms * 3.6 < _1 } || CLASSES_KMH.size
      end

      def percentile(values, fraction)
        sorted = values.sort
        sorted[((sorted.size - 1) * fraction).round]
      end

      def kmh(speed_ms) = (speed_ms * 3.6).round(1)

      def pct(part, whole) = whole.zero? ? 0.0 : (part * 100.0 / whole).round(1)
  end
end
