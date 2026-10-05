# A tap drawn on the networks layer can name the map's water source it is fed
# by (`properties.water_source_id`). The link must point to a source of the
# same map, and the tap then takes the source's potability, so exports, the
# MCP and the phone app read the right `potable` without knowing sources.
module MapFeature::WaterSourceLink
  extend ActiveSupport::Concern

  included do
    before_validation :apply_water_source
    validate :water_source_belongs_to_map
  end

  def water_source_id
    value = properties.to_h["water_source_id"]
    Integer(value.to_s, exception: false) if value.present?
  end

  def water_source
    return nil unless water_source_id && WaterSource::LINKABLE_KINDS.include?(kind)
    @water_source = nil if @water_source&.id != water_source_id
    @water_source ||= WaterSource.find_by(id: water_source_id, map_id:)
  end

  private
    def apply_water_source
      return unless properties.to_h.key?("water_source_id")
      if properties["water_source_id"].blank?
        self.properties = properties.except("water_source_id")
      elsif water_source
        self.properties = properties.merge("water_source_id" => water_source.id, "potable" => water_source.potable)
      end
    end

    def water_source_belongs_to_map
      return if properties.to_h["water_source_id"].blank? || !WaterSource::LINKABLE_KINDS.include?(kind)
      return if water_source
      errors.add(:base, :water_source, message: I18n.t("water_sources.errors.unknown_source"))
    end
end
