# Where the soil dug out of an element goes (pond, swale, ditch, rain garden,
# sunken path): `topsoil_to` for the top layer, `subsoil_to` for the rest.
# Each is either one destination or a list of them,
# `[{ "to" => 12 }, { "to" => "spread", "m3" => 4.5 }]`, where a destination
# is the id of another feature of the same map (a mound, a raised bed, a
# zone) or one of DESTINATIONS, and `m3` an optional fixed volume in place
# (without it, the editor shares the soil by the room left in each
# receiver). `topsoil_cm` says how deep the topsoil is there, `dug` that the
# element is already dug (the land as it is). The earthworks balance itself
# is computed in the editor (map/earthworks/earthworks.ts).
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

  MAX_DESTINATIONS = 10

  private
    def destination_value(value)
      return value if value.is_a?(Integer)
      return value.to_i if value.is_a?(String) && value.match?(/\A\d+\z/)
      value
    end

    def normalize_soil_destinations
      props = properties.to_h
      return unless DESTINATION_KEYS.any? { |key| props.key?(key) }

      next_props = props.dup
      wanted = DESTINATION_KEYS.flat_map { |key| Array.wrap(props[key]).map { |v| v.is_a?(Hash) ? v["to"] : v } }
                               .filter_map { |v| Integer(v.to_s, exception: false) }
      known = wanted.any? && map ? map.features.where(id: wanted).where.not(status: "rejected").pluck(:id) : []
      dropped = ->(id) { id.is_a?(Integer) && id != self.id && !known.include?(id) }
      DESTINATION_KEYS.each do |key|
        next unless next_props.key?(key)
        value = next_props[key]
        if value.nil?
          next # an importer may carry the key blank; nil already reads as undecided
        elsif value.is_a?(Array)
          entries = value.map do |entry|
            next entry unless entry.is_a?(Hash)
            entry = entry.stringify_keys
            entry["to"] = destination_value(entry["to"])
            entry["m3"] = Float(entry["m3"].to_s.tr(",", "."), exception: false) || entry["m3"] if entry["m3"].is_a?(String)
            entry.delete("m3") if entry["m3"].blank? && entry.key?("m3")
            entry
          end
          entries.reject! { |entry| entry.is_a?(Hash) && dropped.(entry["to"]) }
          if entries.empty? then next_props.delete(key)
          elsif entries.size == 1 && entries.first.is_a?(Hash) && entries.first.keys == [ "to" ] then next_props[key] = entries.first["to"]
          else next_props[key] = entries
          end
        elsif value.blank?
          next_props.delete(key)
        else
          id = destination_value(value)
          next unless id.is_a?(Integer)
          next_props[key] = id
          next_props.delete(key) if dropped.(id)
        end
      end
      self.properties = next_props if next_props != props
    end

    def valid_destination?(value)
      (value.is_a?(Integer) && value != id) || DESTINATIONS.include?(value)
    end

    def validate_soil_destinations
      props = properties.to_h
      DESTINATION_KEYS.each do |key|
        value = props[key]
        next if value.nil?
        valid = if value.is_a?(Array)
          value.size.between?(1, MAX_DESTINATIONS) &&
            value.all? do |entry|
              entry.is_a?(Hash) && (entry.keys - %w[to m3]).empty? && valid_destination?(entry["to"]) &&
                (!entry.key?("m3") || (entry["m3"].is_a?(Numeric) && entry["m3"] >= 0 && entry["m3"] < 1_000_000))
            end &&
            value.map { |entry| entry["to"] }.uniq.size == value.size
        else
          valid_destination?(value)
        end
        errors.add(:base, :soil_destination, message: I18n.t("earthworks.errors.destination")) unless valid
      end
      if props.key?("topsoil_cm") && !(props["topsoil_cm"].is_a?(Integer) && TOPSOIL_CM_RANGE.cover?(props["topsoil_cm"]))
        errors.add(:base, :topsoil_cm, message: I18n.t("earthworks.errors.topsoil_cm"))
      end
      if props.key?("dug") && ![ true, false ].include?(props["dug"])
        errors.add(:base, :dug, message: I18n.t("earthworks.errors.dug"))
      end
    end
end
