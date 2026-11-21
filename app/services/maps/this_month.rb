module Maps
  # « Ce mois-ci sur ton terrain »: what this month asks of a place, for the
  # palette's « Au fil de l'année » and the AI (get_map `this_month`). The
  # species placed on the map that flower, ripen or are pruned this month
  # (the catalogue's calendars, as in WeekReport), and the signs of the season
  # worth going out for now (FirstHourMissions::SIGNS_BY_MONTH), each with
  # when it was last seen on this land: a sign not seen in the last twelve
  # months is one the person still has to go and look at.
  class ThisMonth
    MONTH_FIELDS = WeekReport::MONTH_FIELDS
    NAMES_SHOWN = 12

    def initialize(map, today: Date.current, inventory: nil)
      @map = map
      @today = today
      @inventory = inventory || MapPlantInventory.new(map)
    end

    def as_json(*)
      { month: @today.month, month_name: I18n.l(@today, format: "%B"), plants:, signs:, unobserved: signs.reject { _1[:seen_this_year] }.map { _1[:sign] } }
    end

    def plants
      @plants ||= begin
        placed = @inventory.lines.select { _1.placed_count.to_i.positive? && _1.species }
        MONTH_FIELDS.to_h do |key, field|
          names = placed.select { |line| Array(line.species.public_send(field)).include?(@today.month) }.map(&:display_name).uniq
          [ key, { names: names.first(NAMES_SHOWN), count: names.size } ]
        end
      end
    end

    def signs
      @signs ||= begin
        keys = FirstHourMissions::SIGNS_BY_MONTH.fetch(@today.month)
        seen = last_seen(keys)
        keys.map do |sign|
          at = seen[sign]
          { sign:, label: I18n.t("drawing.options.sign.#{sign}"), hint: I18n.t("mobile.season.hints.#{sign}", default: nil),
            last_seen_on: at&.to_date&.iso8601, seen_this_year: at.present? && at > @today.to_time - 1.year }
        end
      end
    end

    private
      def last_seen(keys)
        @map.features.active.where(kind: MapFeature::SeasonSign::SIGN_KIND).where("properties->>'sign' IN (?)", keys)
          .each_with_object({}) do |feature, seen|
            sign = feature.properties["sign"]
            at = feature.observed_at or next
            seen[sign] = at if seen[sign].nil? || at > seen[sign]
          end
      end
  end
end
