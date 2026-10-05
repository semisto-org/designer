module Providers
  module Climate
    # Climate normals and projections from reference data seeded in the
    # region's settings (regions.settings["climate"], see
    # config/climate/<region>.yml). Coarse by design: one set of normals per
    # natural sub-area, one set of deltas per horizon and scenario, every
    # value flagged "indicative" with its sources, stations and per-value
    # references. No network call.
    class Static < Provider
      CACHE_TTL = 12.hours

      def initialize(region)
        @region = region
      end

      def supports?(capability)
        case capability
        when :normals then sub_areas.any?
        when :projections then sub_areas.any? && horizons.any?
        else false
        end
      end

      def current_normals(point)
        return unavailable(:not_configured) unless supports?(:normals)
        point = Point.from(point)
        return unavailable(:no_location) unless point

        cached("normals", version, point.cache_key(3), expires_in: CACHE_TTL) do
          area = sub_area_for(point)
          normals = area.fetch("normals")
          ok(
            sub_area: area.slice("key", "name", "description").symbolize_keys,
            normals: normals_data(normals),
            zone: HardinessZone.for_temperature(normals["extreme_min_c"])&.as_json,
            reference_period: climate["reference_period"],
            status: climate["status"] || "indicative",
            note: climate["note"],
            stations: stations_of(area),
            references: references_of(area),
            sources: sources_for(%w[normals zones])
          )
        end
      end

      def projection(point, horizon:, scenario:)
        validate_projection!(horizon, scenario)
        return unavailable(:not_configured) unless supports?(:projections)
        point = Point.from(point)
        return unavailable(:no_location) unless point
        horizon = horizon.to_s
        scenario = scenario.to_s
        deltas = horizons.dig(horizon, scenario)
        return unavailable(:not_configured) unless deltas

        cached("projection", version, point.cache_key(3), horizon, scenario, expires_in: CACHE_TTL) do
          area = sub_area_for(point)
          ok(projection_data(area.fetch("normals"), horizon, scenario, deltas))
        end
      end

      private
        def climate = @region&.setting("climate") || {}

        def version = [ @region&.id, @region&.updated_at&.to_i, climate["version"] ].join("-")

        def sub_areas = Array(climate["sub_areas"]).select { |area| area["normals"].is_a?(Hash) }

        def horizons = climate.dig("projections", "horizons") || {}

        # First sub-area whose outline contains the point, else the default
        # one (or the last one listed).
        def sub_area_for(point)
          location = point.to_rgeo
          sub_areas.find { |area| area["geometry"] && geometry_of(area)&.contains?(location) } ||
            sub_areas.find { |area| area["default"] } || sub_areas.last
        end

        def geometry_of(area)
          @geometries ||= {}
          @geometries[area["key"]] ||= RGeo::GeoJSON.decode(area["geometry"], geo_factory: GeoJsonGeometry::FACTORY)
        rescue RGeo::Error::InvalidGeometry, JSON::ParserError
          nil
        end

        def normals_data(normals)
          {
            mean_temp_c: normals["mean_temp_c"],
            summer_mean_temp_c: normals["summer_mean_temp_c"],
            winter_mean_temp_c: normals["winter_mean_temp_c"],
            annual_precip_mm: normals["annual_precip_mm"],
            frost_days: normals["frost_days"],
            extreme_min_c: normals["extreme_min_c"],
            last_spring_frost: normals["last_spring_frost"],
            first_autumn_frost: normals["first_autumn_frost"],
            frost_free_days: frost_free_days(normals["last_spring_frost"], normals["first_autumn_frost"])
          }
        end

        def frost_free_days(last_spring, first_autumn)
          from = month_day(last_spring)
          to = month_day(first_autumn)
          from && to && to > from ? (to - from).to_i : nil
        end

        def month_day(value)
          month, day = value.to_s.split("-").map { Integer(_1, exception: false) }
          month && day ? Date.new(2001, month, day) : nil
        rescue Date::Error
          nil
        end

        def projection_data(normals, horizon, scenario, deltas)
          now = normals["extreme_min_c"].to_f
          low, central, high = triple(deltas["extreme_min_delta_c"])
          {
            horizon:,
            scenario:,
            period: horizons.dig(horizon, "period"),
            ipcc: climate.dig("projections", "scenarios", scenario, "ipcc"),
            reference_period: climate.dig("projections", "reference_period") || climate["reference_period"],
            extreme_min_c: (now + central).round(1),
            extreme_min_range_c: [ (now + low).round(1), (now + high).round(1) ],
            zone: HardinessZone.for_temperature(now + central).as_json,
            # Zones at the low and high ends of the warming range.
            zone_range: [ HardinessZone.for_temperature(now + low).code, HardinessZone.for_temperature(now + high).code ],
            mean_temp_c: shifted(normals["mean_temp_c"], deltas["mean_temp_delta_c"]),
            summer_mean_temp_c: shifted(normals["summer_mean_temp_c"], deltas["summer_temp_delta_c"]),
            deltas: {
              mean_temp_c: triple(deltas["mean_temp_delta_c"]),
              extreme_min_c: [ low, central, high ],
              summer_temp_c: triple(deltas["summer_temp_delta_c"]),
              summer_precip_pct: triple(deltas["summer_precip_change_pct"]),
              winter_precip_pct: triple(deltas["winter_precip_change_pct"])
            },
            status: climate["status"] || "indicative",
            references: projection_references(deltas["references"]),
            sources: sources_for(%w[projections zones])
          }
        end

        # Where each normal comes from: the sources (resolved to their
        # publisher) and the station values with the method.
        def references_of(area)
          by_key = Array(climate["sources"]).index_by { _1["key"] }
          (area["references"] || {}).filter_map do |field, reference|
            next unless area.fetch("normals").key?(field)
            sources = Array(reference["sources"]).filter_map { by_key[_1]&.slice("key", "publisher", "url")&.symbolize_keys }
            [ field.to_sym, { sources:, detail: reference["detail"] } ]
          end.to_h
        end

        def stations_of(area)
          Array(area["stations"]).map do |station|
            { name: station["name"], id: station["id"], altitude_m: station["altitude_m"], source: station["source"] }
          end
        end

        PROJECTION_FIELDS = {
          "mean_temp_delta_c" => :mean_temp_c,
          "extreme_min_delta_c" => :extreme_min_c,
          "summer_temp_delta_c" => :summer_temp_c,
          "summer_precip_change_pct" => :summer_precip_pct,
          "winter_precip_change_pct" => :winter_precip_pct
        }.freeze

        # Same keys as `deltas` in the projection data.
        def projection_references(references)
          (references || {}).filter_map { |field, detail| PROJECTION_FIELDS[field] && [ PROJECTION_FIELDS[field], detail ] }.to_h
        end

        def triple(values)
          values = Array(values).map { _1&.to_f }
          values.size == 3 ? values : [ values.first, values.first, values.first ]
        end

        def shifted(base, deltas)
          central = triple(deltas)[1]
          base && central ? (base.to_f + central).round(1) : nil
        end

        def sources_for(uses)
          Array(climate["sources"]).select { |source| uses.include?(source["used_for"]) }.map do |source|
            source.slice("key", "title", "publisher", "year", "url", "licence").symbolize_keys
          end
        end
    end
  end
end
