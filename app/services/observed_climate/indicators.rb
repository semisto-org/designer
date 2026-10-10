class ObservedClimate
  # What a gardener needs to know about thirty years of observed climate,
  # from daily values (HourlySeries::Day: tmin, tmax, tmean in °C, rain in
  # mm). Plain Ruby, no I/O.
  #
  # Definitions:
  # - a frost day has a minimum at or below 0 °C (hourly 2 m temperature);
  # - the last spring frost is the last frost day before 1 July, the first
  #   autumn frost the first one from 1 July; dates are compared as days of
  #   a common (non-leap) year and given as "MM-DD";
  # - "1 year in 5": the last spring frost falls after `late` in one year
  #   out of five (80th percentile), the first autumn frost before `early`
  #   in one year out of five (20th percentile). A year with no spring
  #   frost counts as the earliest, one with no autumn frost as the latest;
  # - frost-free season: days between the last spring and the first autumn
  #   frost of the same year;
  # - annual minimum: the coldest hour of each year, averaged (the USDA
  #   hardiness zone is defined on it);
  # - growing degree days, base 10 °C: sum over the year of
  #   max(0, daily mean - 10);
  # - hot days: maximum at or above 30 °C;
  # - trend: the first ten years against the last ten.
  #
  # Only complete years count (at least COMPLETE_DAYS days of data).
  class Indicators
    FROST_C = 0.0
    HOT_C = 30.0
    GDD_BASE_C = 10.0
    COMPLETE_DAYS = 360
    MIDYEAR = 182 # 1 July, day of a non-leap year
    DECADE = 10

    def initialize(days)
      @days = days
    end

    def years
      @years ||= @days.group_by { _1.date.year }.select { |_, days| days.size >= COMPLETE_DAYS }.sort.to_h
    end

    def as_json(*)
      return { years: 0 } if years.empty?

      per_year = years.transform_values { year_metrics(_1) }
      annual_min = mean(per_year.values.map { _1[:annual_min_c] })
      {
        years: years.size,
        first_year: years.keys.first,
        last_year: years.keys.last,
        annual: summary(per_year.values).merge(coldest_c: round(per_year.values.map { _1[:annual_min_c] }.min)),
        zone: HardinessZone.for_temperature(annual_min)&.as_json,
        months: months,
        frost: frost(per_year.values),
        trend: trend(per_year)
      }
    end

    private
      def year_metrics(days)
        spring = days.select { frost?(_1) && doy(_1.date) < MIDYEAR }.map { doy(_1.date) }.max
        autumn = days.select { frost?(_1) && doy(_1.date) >= MIDYEAR }.map { doy(_1.date) }.min
        {
          mean_temp_c: mean(days.map(&:tmean)),
          rain_mm: days.sum(&:precip_mm),
          annual_min_c: days.map(&:tmin).min,
          gdd_base10: days.sum { [ _1.tmean - GDD_BASE_C, 0.0 ].max },
          hot_days: days.count { _1.tmax >= HOT_C },
          frost_days: days.count { frost?(_1) },
          last_spring_frost: spring,
          first_autumn_frost: autumn,
          frost_free_days: (autumn || 366) - (spring || 0) - 1
        }
      end

      def frost?(day) = day.tmin <= FROST_C

      # Day of the year in a non-leap year (29 February counts as the 28th).
      def doy(date) = Date.new(2001, date.month, date.month == 2 ? [ date.day, 28 ].min : date.day).yday

      def summary(metrics)
        {
          mean_temp_c: round(mean(metrics.map { _1[:mean_temp_c] })),
          rain_mm: mean(metrics.map { _1[:rain_mm] })&.round,
          annual_min_c: round(mean(metrics.map { _1[:annual_min_c] })),
          gdd_base10: mean(metrics.map { _1[:gdd_base10] })&.round,
          hot_days: round(mean(metrics.map { _1[:hot_days] })),
          frost_days: mean(metrics.map { _1[:frost_days] })&.round,
          frost_free_days: mean(metrics.map { _1[:frost_free_days] })&.round
        }
      end

      # Mean temperature, mean daily minimum and maximum, and rain, month by
      # month over the complete years.
      def months
        days = years.values.flatten
        count = years.size
        (1..12).map do |month|
          of_month = days.select { _1.date.month == month }
          {
            month:,
            mean_temp_c: round(mean(of_month.map(&:tmean))),
            mean_min_c: round(mean(of_month.map(&:tmin))),
            mean_max_c: round(mean(of_month.map(&:tmax))),
            rain_mm: (of_month.sum(&:precip_mm) / count).round
          }
        end
      end

      def frost(metrics)
        spring = metrics.map { _1[:last_spring_frost] }
        autumn = metrics.map { _1[:first_autumn_frost] }
        {
          last_spring: {
            mean: month_day(mean(spring.compact)),
            late: month_day(percentile(spring.map { _1 || 0 }, 0.8)),
            years_with: spring.compact.size
          },
          first_autumn: {
            mean: month_day(mean(autumn.compact)),
            early: month_day(percentile(autumn.map { _1 || 366 }, 0.2)),
            years_with: autumn.compact.size
          },
          frost_free_days: mean(metrics.map { _1[:frost_free_days] })&.round
        }
      end

      def trend(per_year)
        return nil if per_year.size < DECADE * 2

        first = per_year.first(DECADE).to_h
        last = per_year.to_a.last(DECADE).to_h
        a = decade(first)
        b = decade(last)
        delta = a.except(:from, :to).to_h { |key, value| [ key, value && b[key] && round(b[key] - value) ] }
        { first: a, last: b, delta: }
      end

      def decade(per_year)
        metrics = per_year.values
        {
          from: per_year.keys.first,
          to: per_year.keys.last,
          mean_temp_c: round(mean(metrics.map { _1[:mean_temp_c] })),
          rain_mm: mean(metrics.map { _1[:rain_mm] })&.round,
          annual_min_c: round(mean(metrics.map { _1[:annual_min_c] })),
          gdd_base10: mean(metrics.map { _1[:gdd_base10] })&.round,
          hot_days: round(mean(metrics.map { _1[:hot_days] })),
          frost_free_days: mean(metrics.map { _1[:frost_free_days] })&.round,
          last_spring_frost_doy: mean(metrics.filter_map { _1[:last_spring_frost] })&.round,
          first_autumn_frost_doy: mean(metrics.filter_map { _1[:first_autumn_frost] })&.round
        }
      end

      def mean(values)
        values = values.compact
        values.empty? ? nil : values.sum.to_f / values.size
      end

      # Nearest-rank percentile.
      def percentile(values, fraction)
        return nil if values.empty?
        sorted = values.sort
        sorted[((fraction * sorted.size).ceil - 1).clamp(0, sorted.size - 1)]
      end

      # A day of the (non-leap) year as "MM-DD"; nil outside the year.
      def month_day(doy)
        return nil if doy.nil? || doy < 1 || doy > 365
        (Date.new(2001, 1, 1) + (doy.round - 1)).strftime("%m-%d")
      end

      def round(value) = value&.round(1)
  end
end
