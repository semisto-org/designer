module Mcp
  module Tools
    # Finds the plants a line of a notebook tool names, by id (feature_ids)
    # or by their number on the plan (numbers, « 9.1 »; also a name that
    # starts with « n° 9.1 », as maps imported before numbers had them).
    # Raises Invalid with the reason when one of them is not on the map.
    module PlantLookup
      Invalid = Class.new(StandardError)

      private
        def plants_for(map, line)
          scope = map.features.active.where(kind: PlantableFeature::PLANT)
          ids = Array(line["feature_ids"]).map(&:to_i)
          numbers = Array(line["numbers"]).map { _1.to_s.squish.delete_prefix("n°").strip }.compact_blank
          raise Invalid, t("harvest_errors.no_plant") if ids.empty? && numbers.empty?
          found = scope.where(id: ids).to_a
          missing_numbers = numbers.reject do |number|
            matches = scope.where("map_features.properties->>'number' = :number OR map_features.name ~* :pattern",
                                  number:, pattern: "^n°\\s*#{Regexp.escape(number)}(\\s|$)").to_a
            found.concat(matches)
            matches.any?
          end
          missing_ids = ids - found.map(&:id)
          if missing_ids.any? || missing_numbers.any?
            raise Invalid, t("harvest_errors.not_found", plants: (missing_ids.map { "##{_1}" } + missing_numbers.map { "n° #{_1}" }).join(", "))
          end
          found.uniq
        end
    end
  end
end
