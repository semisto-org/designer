# Every plant on a map carries a number (`properties.number`), written before
# its name on the map like the key of a planting plan. A new plant takes the
# next free number of its map; a person can force another one (plans that
# were numbered before Designer). When another plant of the map holds it,
# the change is refused, unless it asks to swap (`swap_number`): the other
# plant then takes the number this one leaves (or the next free one for a
# new plant), so a plan can be renumbered plant by plant. The next number
# follows the highest one on the map (rejected
# drafts included), so gaps stay gaps. An update that sends the properties back without the number keeps
# the one the plant had.
module MapFeature::PlantNumber
  extend ActiveSupport::Concern

  # The number, cast from text, in SQL; NULL when it is not a plain integer.
  NUMBER_SQL = "CASE WHEN map_features.properties->>'number' ~ '^[0-9]{1,9}$' THEN (map_features.properties->>'number')::int END"

  included do
    # Not stored: set by the request that renumbers a plant.
    attribute :swap_number, :boolean, default: false

    before_validation :assign_plant_number, if: :plant?
    validate :validate_plant_number, if: :plant?
    before_save :give_number_away, if: -> { plant? && swap_number }
  end

  def plant_number = integer_property("number")

  # The other plant of the map that holds this plant's number, if any.
  def plant_number_holder
    number = plant_number
    return nil unless map && number
    map.features.where(kind: PlantableFeature::PLANT).where.not(id:).where.not(status: "rejected")
       .where("#{NUMBER_SQL} = ?", number).order(:id).first
  end

  # After a swap: the plant that took this plant's former number.
  attr_reader :swapped_with

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
      # Trashed plants count: a restored plant must not meet its number taken.
      map.features.unscope(where: :deleted_at).where(kind: PlantableFeature::PLANT).where.not(id:).maximum(Arel.sql(NUMBER_SQL)).to_i + 1
    end

    def validate_plant_number
      number = plant_number
      return errors.add(:properties, :invalid) unless number&.positive?
      return if swap_number || plant_number_holder.nil?
      errors.add(:base, :number_taken, message: I18n.t("plant_feature.number_taken", number:))
    end

    # Inside the save's transaction: the holder takes the number this plant
    # leaves, saved without validation (both numbers are briefly shared),
    # which still bumps its lock version and tells the open editors.
    def give_number_away
      holder = plant_number_holder or return
      previous = properties_in_database.to_h["number"].to_s
      former = previous.match?(/\A\d+\z/) && previous.to_i != plant_number ? previous.to_i : nil
      holder.properties = holder.properties.merge("number" => former || next_plant_number)
      holder.updated_by = updated_by if updated_by
      holder.save!(validate: false)
      @swapped_with = holder
    end
end
