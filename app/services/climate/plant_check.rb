module Climate
  # Is a plant suited to the site's climate, today and under a projected
  # climate? Pure: works on PlantTraits and the provider's data.
  #
  # - cold: the site's average annual extreme minimum against the plant's
  #   cold limit (at risk below it, borderline within BORDERLINE_MARGIN_C);
  # - heat: the projected hardiness zone beyond the plant's warmest zone;
  # - drought: a drought-sensitive plant facing drier, hotter summers.
  #
  # Statuses: ok, borderline, at_risk, unknown (no usable trait).
  class PlantCheck
    BORDERLINE_MARGIN_C = 2.0
    DRIER_SUMMER_PCT = -10.0
    HOTTER_SUMMER_C = 2.5
    SEVERITY = { "unknown" => 0, "ok" => 1, "borderline" => 2, "at_risk" => 3 }.freeze

    def initialize(traits)
      @traits = traits
    end

    # site: { extreme_min_c: }
    def today(site)
      cold = cold_status(site[:extreme_min_c])
      { status: cold[:status], margin_c: cold[:margin_c], risks: cold[:status] == "ok" || cold[:status] == "unknown" ? [] : [ "cold" ] }
    end

    # projection: the data of a Static projection (extreme_min_c, zone, deltas)
    def future(projection)
      checks = {
        "cold" => cold_status(projection[:extreme_min_c])[:status],
        "heat" => heat_status(projection[:zone]),
        "drought" => drought_status(projection[:deltas] || {})
      }
      worst = checks.values.max_by { SEVERITY[_1] }
      { status: worst, risks: checks.select { |_, status| %w[borderline at_risk].include?(status) }.keys }
    end

    private
      def cold_status(extreme_min_c)
        limit = @traits.cold_limit_c
        return { status: "unknown", margin_c: nil } if limit.nil? || extreme_min_c.nil?
        margin = (extreme_min_c.to_f - limit).round(1)
        status = if margin.negative? then "at_risk"
        elsif margin < BORDERLINE_MARGIN_C then "borderline"
        else "ok"
        end
        { status:, margin_c: margin }
      end

      def heat_status(zone_data)
        return "unknown" unless @traits.max_zone && zone_data
        zone = HardinessZone.parse(zone_data[:code] || zone_data["code"])
        return "unknown" unless zone
        if zone.number > @traits.max_zone.number then "at_risk"
        elsif zone.number == @traits.max_zone.number && zone.half == "b" then "borderline"
        else "ok"
        end
      end

      def drought_status(deltas)
        return "unknown" if @traits.drought.nil?
        return "ok" if @traits.drought == :tolerant
        precip = Array(deltas[:summer_precip_pct])[1]
        heat = Array(deltas[:summer_temp_c])[1]
        return "unknown" if precip.nil? && heat.nil?
        if (precip && precip <= DRIER_SUMMER_PCT) || (heat && heat >= HOTTER_SUMMER_C) then "at_risk"
        else "borderline"
        end
      end
  end
end
