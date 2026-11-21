module Mcp
  module Tools
    # What someone standing at a point of the land will see of the design
    # at a year: each plant point around, its distance and direction, its
    # size that year and how high it rises above the horizon of the eye (the
    # same growth as the 3D view and « Fenêtre sur l'an 15 »), and the link
    # that opens that window on the phone, there. For an AI that wants to say
    # « from the terrace, in 2041, the walnut will hide the barn », then send
    # the person outside to see it through the camera.
    class GetViewFromPoint < Base
      # From the boundary: beyond, the design is too far to speak of.
      MAX_DISTANCE_M = 300
      RADIUS_M = 150
      MAX_RADIUS_M = 400
      LIMIT = 40
      EYE_HEIGHT_M = 1.6
      DEFAULT_FOV = 70
      DEFAULT_YEAR = 15
      EARTH_RADIUS_M = 6_371_008.8

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          lng: { type: "number", minimum: -180, maximum: 180, description: :lng },
          lat: { type: "number", minimum: -90, maximum: 90, description: :lat },
          heading: { type: "number", minimum: 0, maximum: 360, description: :heading },
          field_of_view: { type: "number", minimum: 10, maximum: 180, description: :field_of_view },
          year: { type: "integer", minimum: 0, maximum: 40, description: :year },
          radius_m: { type: "number", minimum: 5, maximum: MAX_RADIUS_M, description: :radius_m }
        },
        required: %w[map_id lng lat]
      )
      hints

      include PlaceAccess

      def perform(map_id:, lng:, lat:, heading: nil, field_of_view: DEFAULT_FOV, year: DEFAULT_YEAR, radius_m: RADIUS_M)
        map = find_map!(map_id)
        require_point_near!(map, lng, lat, MAX_DISTANCE_M)
        growing = Relief::GrowingPlants.new(map).as_json
        origin = Date.iso8601(growing[:origin])
        target = origin.next_year(year)
        today = Date.current
        heights = map.terrain&.ready? ? Relief::Heights.new(map.terrain) : nil
        ground = heights&.at(lng, lat)
        eye = ground && ground + EYE_HEIGHT_M

        not_yet = 0
        plants = growing[:plants].reject { |p| p[:existing] }.filter_map do |plant|
          distance = distance_m(lng, lat, plant[:lng], plant[:lat])
          next if distance > radius_m || distance < 0.5

          size = size_at(plant, target:, today:)
          unless size
            not_yet += 1
            next
          end
          bearing = bearing_deg(lng, lat, plant[:lng], plant[:lat])
          base = heights&.at(plant[:lng], plant[:lat])
          rise = (base && eye ? base - eye : -EYE_HEIGHT_M) + size[:height]
          {
            feature_id: plant[:id], name: plant[:ownName] || plant[:name], latin_name: plant[:latinName], number: plant[:number],
            strata: plant[:strata], planted: plant[:plantedOn].present? || plant[:plantedLongAgo],
            distance_m: distance.round(1), bearing_deg: bearing.round,
            height_m: size[:height].round(1), spread_m: size[:spread].round(1),
            # How high its top stands above the eye's horizon, and how wide its crown looks.
            top_angle_deg: (Math.atan2(rise, distance) * 180 / Math::PI).round(1),
            width_angle_deg: (2 * Math.atan2(size[:spread] / 2, distance) * 180 / Math::PI).round(1),
            in_view: heading ? in_view?(bearing, heading, field_of_view) : nil
          }.compact
        end.sort_by { |p| p[:distance_m] }

        shown = heading ? plants.select { |p| p[:in_view] } : plants
        {
          point: [ lng, lat ], ground_altitude_m: ground&.round(1), eye_height_m: EYE_HEIGHT_M,
          heading:, field_of_view: (field_of_view if heading),
          year:, calendar_year: target.year, origin: growing[:origin],
          plants: shown.first(LIMIT), plants_total: shown.size,
          plants_not_yet_planted: not_yet,
          relief: heights ? "terrain" : "flat",
          window_url: window_url(map, lng, lat, heading, year),
          note: t("tools.get_view_from_point.note")
        }
      end

      private
        # The plant's size at `target`, as the 3D view grows it: a planned
        # plant goes into the ground today; nil before its planting or once
        # a support plant gave way.
        def size_at(plant, target:, today:)
          planted_on = plant[:plantedOn] && (Date.iso8601(plant[:plantedOn]) rescue nil)
          age = plant[:plantedLongAgo] ? PlantGrowth::Curve::MEASURED_LONG_AGO : (target - (planted_on || today)) / 365.25
          form = PlantGrowth::Curve.form(plant[:strata], plant[:plantType])
          training = PlantGrowth::Curve.training(form, plant[:training])
          graft = training == "free" ? PlantGrowth::Curve.graft(form, plant[:graft]) : nil
          support_until = plant[:support] && !plant[:plantedLongAgo] ? plant[:supportUntil] : nil
          PlantGrowth::Curve.size_at(
            strata: plant[:strata], height: plant[:heightM], spread: plant[:spreadM], maturity: plant[:maturityYears],
            age: age.to_f, training:, graft:, until_years: support_until,
            measured: PlantGrowth::Curve.measured(plant[:measures], planted_on:)
          )
        end

        def in_view?(bearing, heading, fov)
          delta = ((bearing - heading + 540) % 360) - 180
          delta.abs <= fov / 2.0
        end

        def distance_m(lng1, lat1, lng2, lat2)
          p1 = lat1 * Math::PI / 180
          p2 = lat2 * Math::PI / 180
          dp = p2 - p1
          dl = (lng2 - lng1) * Math::PI / 180
          h = Math.sin(dp / 2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2)**2
          2 * EARTH_RADIUS_M * Math.asin([ 1, Math.sqrt(h) ].min)
        end

        def bearing_deg(lng1, lat1, lng2, lat2)
          p1 = lat1 * Math::PI / 180
          p2 = lat2 * Math::PI / 180
          dl = (lng2 - lng1) * Math::PI / 180
          y = Math.sin(dl) * Math.cos(p2)
          x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
          (Math.atan2(y, x) * 180 / Math::PI + 360) % 360
        end

        def window_url(map, lng, lat, heading, year)
          query = { lng: lng.round(7), lat: lat.round(7), heading: heading&.round, year: }.compact.to_query
          "#{map_url(map)}/window?#{query}"
        end

        def summarize_result(data) = { plants: data[:plants_total], year: data[:year] }
    end
  end
end
