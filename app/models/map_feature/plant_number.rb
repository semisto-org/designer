# Every plant on a map carries a number (`properties.number`), written before
# its name on the map like the key of a planting plan. A new plant takes the
# next free number of its map; a person can force another one (plans that
# were numbered before Designer), as long as no other plant of the map
# holds it. The next number follows the highest one on the map (rejected
# drafts included), so gaps stay gaps. An update that sends the properties back without the number keeps
# the one the plant had.
module MapFeature::PlantNumber
  extend ActiveSupport::Concern

  # The number, cast from text, in SQL; NULL when it is not a plain integer.
  NUMBER_SQL = "CASE WHEN map_features.properties->>'number' ~ '^[0-9]{1,9}$' THEN (map_features.properties->>'number')::int END"

  included do
    before_validation :assign_plant_number, if: :plant?
    validate :validate_plant_number, if: :plant?
  end

  def plant_number = integer_property("number")

  private
    def assign_plant_number
      props = properties.dup
      number = props["number"]
      if number.blank? && persisted?
        number = properties_in_database.to_h["number"]
      end
      number = number.to_i if number.to_s.match?(/\A\d+\z/)
      number = next_plant_number unless number.is_a?(Integer) && number.positive?
      props["number"] = number
      self.properties = props
    end

    def next_plant_number
      return 1 unless map
      # Two plants placed at the same time must not share a number.
      Map.where(id: map.id).lock.pick(:id) if map.persisted?
      map.features.where(kind: PlantableFeature::PLANT).where.not(id:).maximum(Arel.sql(NUMBER_SQL)).to_i + 1
    end

    def validate_plant_number
      number = plant_number
      return errors.add(:properties, :invalid) unless number&.positive?
      return unless map
      taken = map.features.where(kind: PlantableFeature::PLANT).where.not(id:).where.not(status: "rejected")
        .where("#{NUMBER_SQL} = ?", number).exists?
      errors.add(:base, I18n.t("plant_feature.number_taken", number:)) if taken
    end
end
