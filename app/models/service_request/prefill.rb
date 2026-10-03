# What the request forms start with, read from the map: its plant list (when
# the plants area provides `Map#plant_list`, else the named plants placed on
# the map), surface, address and commune. Defensive on purpose: a missing or
# differently shaped plant list never breaks the panel, the person can
# always type the list by hand.
class ServiceRequest::Prefill
  NAME_KEYS = %i[name common_name label species_name scientific_name].freeze
  QUANTITY_KEYS = %i[quantity qty count total number].freeze

  def initialize(map)
    @map = map
  end

  def plants
    @plants ||= from_plant_list || from_features || []
  end

  # "plant_list" (the map's list), "features" (counted from the plan) or nil.
  def source
    plants
    @source
  end

  def commune
    @map.address.to_s[/\b\d{4}\s+([[:alpha:]' -]+?)\s*(?:,|\z)/, 1]
  end

  def as_json(*)
    { plants:, plantsSource: source, surfaceM2: @map.area_m2&.round, address: @map.address, commune: }
  end

  private
    def from_plant_list
      return unless @map.respond_to?(:plant_list)
      list = @map.plant_list
      list = list[:items] || list["items"] || [] if list.is_a?(Hash)
      lines = list.to_a.filter_map { |entry| line_from(entry) }
      return if lines.empty?
      @source = "plant_list"
      lines
    rescue StandardError => error
      Rails.logger.warn("ServiceRequest::Prefill: plant_list unreadable (#{error.class}: #{error.message})")
      nil
    end

    def line_from(entry)
      name = pick(entry, NAME_KEYS) || nested_name(entry)
      return if name.blank?
      quantity = Integer(pick(entry, QUANTITY_KEYS).to_s, exception: false) || 1
      species_id = Integer(pick(entry, %i[species_id plant_species_id]).to_s, exception: false)
      { "name" => name.to_s.strip.first(120), "quantity" => quantity.clamp(1, 99_999), "species_id" => species_id }.compact
    end

    def nested_name(entry)
      species = pick(entry, %i[species plant])
      species && pick(species, NAME_KEYS)
    end

    def pick(entry, keys)
      keys.each do |key|
        value = if entry.respond_to?(:key?) then entry[key] || entry[key.to_s]
        elsif entry.respond_to?(key) then entry.public_send(key)
        end
        return value if value.present?
      end
      nil
    end

    def from_features
      rows = @map.features.active.where(layer: "plants")
        .pluck(:name, Arel.sql("properties->>'species_name'"))
      return if rows.empty?
      @source = "features"
      rows.group_by { |name, species| (species.presence || name.presence || I18n.t("journey.requests.unnamed_plant")).to_s.strip }
        .map { |label, group| { "name" => label.first(120), "quantity" => group.size } }
        .sort_by { |line| line["name"].downcase }
    end
end
