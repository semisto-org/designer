module Wind
  # The wind at a map's place, for the wind rose of the « Secteurs » panel,
  # the « Climat » panel, the project dossier and the 3D compass, and for the
  # AI (get_site_data, topic wind): thirty years of ERA5-Land 10 m wind as
  # roses (ObservedClimate::Wind), what the person noted on the land
  # (« Le vent frappe ici » season signs, with the direction the wind came
  # from when the phone gave it), and the map's own wind sectors.
  #
  #   { available: false, reason: "not_configured" | "no_location" }
  #   { available: true, status: "pending" | "failed" | "ready",
  #     scale: { gridKm: 9, windGridKm: 31 }, period: { firstYear, lastYear },
  #     rose: { year, seasons, coldSpring, strong } | nil,   # when ready
  #     signs: [{ id, observedAt, windFromDeg, notes }],
  #     sectors: [{ id, type, season, fromDeg, toDeg, name, status }],
  #     source: {...} }
  #
  # The roses are the region's wind: ERA5-Land interpolates ERA5's ~31 km
  # wind with no relief, so a valley, a hedge or a barn changes what one
  # feels on the land. The UI and the AI say so, and what the person saw
  # outweighs the model.
  class MapReport
    WIND_GRID_KM = 31
    SIGN = "wind_exposed".freeze
    SIGNS_LIMIT = 50

    def initialize(map, observed: ObservedClimate::MapReport.new(map))
      @map = map
      @observed = observed
    end

    def as_json(*)
      climate = @observed.as_json
      return climate unless climate["available"]

      wind = climate.dig("data", "wind")
      rose = wind.is_a?(Hash) && wind["available"] != false ? wind : nil
      status = climate["windStatus"]
      status = "failed" if status == "ready" && rose.nil?
      camelize(
        available: true,
        status:,
        scale: { grid_km: ObservedClimate::MapReport::GRID_KM, wind_grid_km: WIND_GRID_KM },
        period: climate["period"],
        rose: rose && rose.except("hours", "directions"),
        signs:,
        sectors:,
        source: climate["source"]
      )
    end

    private
      def signs
        @map.features.active.where(kind: MapFeature::SeasonSign::SIGN_KIND)
          .where("map_features.properties ->> 'sign' = ?", SIGN)
          .order(created_at: :desc).limit(SIGNS_LIMIT).map do |feature|
            from = Float(feature.properties.to_h["wind_from_deg"], exception: false)
            point = feature.geometry
            {
              id: feature.id, observed_at: feature.observed_at&.iso8601, wind_from_deg: from&.round,
              notes: feature.notes.presence, position: point.respond_to?(:x) ? [ point.x.round(6), point.y.round(6) ] : nil
            }.compact
          end
      end

      def sectors
        @map.features.where(kind: "sector", status: %w[active draft]).in_design.filter_map do |feature|
          props = feature.properties.to_h
          next unless %w[wind cold_wind].include?(props["sector_type"])
          {
            id: feature.id, type: props["sector_type"], season: props["sector_season"].presence || "all_year",
            from_deg: Float(props["from_deg"], exception: false), to_deg: Float(props["to_deg"], exception: false),
            name: feature.name.presence, status: feature.status
          }.compact
        end
      end

      def camelize(value)
        case value
        when Hash then value.to_h { |key, item| [ key.to_s.camelize(:lower), camelize(item) ] }
        when Array then value.map { camelize(_1) }
        else value
        end
      end
  end
end
