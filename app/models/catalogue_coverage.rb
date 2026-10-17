# How complete the plant catalogue is, field by field, for the fields that
# decide what Terranova suggests and checks (PlantFit, PaletteSuggestions,
# PlantingAlerts). For each field: among the reviewed species, how many are
# sourced (checked against a source), filled but still to verify, or empty;
# and the same share among the species people actually put in palettes,
# which says where filling a field helps first.
#
# Also lists the most used species that still miss a field the suggestions
# judge on: the sheets to complete first.
class CatalogueCoverage
  # Fields judged by PlantFit, then the others that suggestions and alerts read.
  FIT_FIELDS = %w[hardiness_zone exposures soil_moisture soil_types soil_ph].freeze
  OTHER_FIELDS = %w[toxic_for eco_services edible_parts fertility harvest_months height_max_m spread_max_m native_countries].freeze
  FIELDS = (FIT_FIELDS + OTHER_FIELDS).freeze
  ARRAY_FIELDS = %w[exposures soil_moisture soil_types soil_ph toxic_for eco_services edible_parts harvest_months native_countries].freeze
  TO_COMPLETE = 20

  Row = Data.define(:field, :decides_fit, :sourced, :to_verify, :empty, :used_filled) do
    def as_json(*) = { field:, decidesFit: decides_fit, sourced:, toVerify: to_verify, empty:, usedFilled: used_filled }
  end

  def total = @total ||= reviewed.count

  # Species in at least one palette (active items), with how many palettes.
  def usage = @usage ||= PaletteItem.where(status: "active").group(:species_id).distinct.count(:map_id)

  def used_total = @used_total ||= reviewed.where(id: usage.keys).count

  def rows
    @rows ||= FIELDS.map do |field|
      filled = reviewed.where(present_sql(field))
      sourced = filled.where(id: PlantFieldSource.where(record_type: "PlantSpecies", field:, status: "sourced").select(:record_id)).count
      count = filled.count
      Row.new(field:, decides_fit: FIT_FIELDS.include?(field), sourced:, to_verify: count - sourced, empty: total - count,
              used_filled: used_total.zero? ? nil : filled.where(id: usage.keys).count)
    end
  end

  # The most used species missing a field PlantFit judges on.
  def to_complete
    ids = usage.sort_by { |id, maps| [ -maps, id ] }.map(&:first)
    missing_any = FIT_FIELDS.map { |field| "NOT (#{present_sql(field)})" }.join(" OR ")
    species = reviewed.where(id: ids).where(missing_any).includes(:common_names).index_by(&:id)
    ids.filter_map { |id| species[id] }.first(TO_COMPLETE).map do |s|
      { id: s.id, slug: s.to_param, name: s.common_name || s.latin_name, latinName: s.latin_name, maps: usage[s.id],
        missing: FIT_FIELDS.reject { |field| s.field_value_present?(field) } }
    end
  end

  def as_json(*) = { total:, usedTotal: used_total, rows: rows.map(&:as_json), toComplete: to_complete }

  private
    def reviewed = PlantSpecies.reviewed

    def present_sql(field)
      column = "plant_species.#{PlantSpecies.connection.quote_column_name(field)}"
      ARRAY_FIELDS.include?(field) ? "cardinality(#{column}) > 0" : "#{column} IS NOT NULL"
    end
end
