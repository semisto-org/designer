# Where the soil dug out of an element goes (pond, swale, ditch, rain garden,
# sunken path): `topsoil_to` for the top layer, `subsoil_to` for the rest.
# Each is either the id of another feature of the same map (a mound, a
# raised bed, a zone) or one of DESTINATIONS. `topsoil_cm` says how deep the
# topsoil is there, `dug` that the element is already dug (the land as it
# is). The earthworks balance itself is computed in the editor
# (map/earthworks/earthworks.ts).
#
# A destination whose feature no longer exists is dropped on the next save,
# so deleting a mound never blocks editing the ponds that fed it.
module MapFeature::SoilDestination
  extend ActiveSupport::Concern

  DESTINATION_KEYS = %w[topsoil_to subsoil_to].freeze
  DESTINATIONS = %w[berm spread stockpile removed].freeze
  TOPSOIL_CM_RANGE = (0..100)

  included do
    before_validation :normalize_soil_destinations
    validate :validate_soil_destinations
  end

  private
    def normalize_soil_destinations
      props = properties.to_h
      return unless DESTINATION_KEYS.any? { |key| props.key?(key) }

      next_props = props.dup
      wanted = DESTINATION_KEYS.filter_map { |key| Integer(props[key].to_s, exception: false) }
      known = wanted.any? && map ? map.features.where(id: wanted).where.not(status: "rejected").pluck(:id) : []
      DESTINATION_KEYS.each do |key|
        next unless next_props.key?(key)
        value = next_props[key]
        id = value.is_a?(Integer) ? value : (value.is_a?(String) && value.match?(/\A\d+\z/) ? value.to_i : nil)
        if value.blank?
          next_props.delete(key)
        elsif id
          next_props[key] = id
          next_props.delete(key) unless id == self.id || known.include?(id)
        end
      end
      self.properties = next_props if next_props != props
    end

    def validate_soil_destinations
      props = properties.to_h
      DESTINATION_KEYS.each do |key|
        value = props[key]
        next if value.nil?
        next if value.is_a?(Integer) && value != id
        next if DESTINATIONS.include?(value)
        errors.add(:base, :soil_destination, message: I18n.t("earthworks.errors.destination"))
      end
      if props.key?("topsoil_cm") && !(props["topsoil_cm"].is_a?(Integer) && TOPSOIL_CM_RANGE.cover?(props["topsoil_cm"]))
        errors.add(:base, :topsoil_cm, message: I18n.t("earthworks.errors.topsoil_cm"))
      end
      if props.key?("dug") && ![ true, false ].include?(props["dug"])
        errors.add(:base, :dug, message: I18n.t("earthworks.errors.dug"))
      end
    end
end
