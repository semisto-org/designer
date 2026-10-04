# What the request forms start with, read from the map: its plant list
# (`Map#plant_list`, else the named plants placed on the map), surface,
# address and commune. Defensive on purpose: an unreadable plant list never
# breaks the panel, the person can always type the list by hand.
class ServiceRequest::Prefill
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
      lines = @map.plant_list.rows.map do |row|
        name = [ row.common_name, row.variety_name && "« #{row.variety_name} »" ].compact.join(" ").presence
        label = name ? "#{name} (#{row.latin_name})" : row.latin_name
        { "name" => label.first(120), "quantity" => row.total.clamp(1, 99_999), "species_id" => row.species_id }
      end
      return if lines.empty?
      @source = "plant_list"
      lines
    rescue StandardError => error
      Rails.logger.warn("ServiceRequest::Prefill: plant_list unreadable (#{error.class}: #{error.message})")
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
