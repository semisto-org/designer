# Per-field provenance for catalogue records (species, varieties, genera).
# Each provenanced field may have one PlantFieldSource row; a field whose
# value is blank always reads as « empty », whatever its row says.
module FieldProvenance
  extend ActiveSupport::Concern

  included do
    has_many :field_sources, class_name: "PlantFieldSource", as: :record, dependent: :delete_all
  end

  class_methods do
    # Fields whose provenance is tracked; each model declares its own.
    def provenanced_fields(*fields)
      return @provenanced_fields || [] if fields.empty?
      @provenanced_fields = fields.flatten.map(&:to_s).freeze
    end
  end

  def provenance_for(field)
    field_sources.detect { |s| s.field == field.to_s }
  end

  def field_value_present?(field)
    value = public_send(field)
    value.respond_to?(:empty?) ? !value.empty? : !value.nil?
  end

  # « sourced », « to_verify » or « empty » (nil when nothing is known).
  def provenance_status(field)
    return "empty" unless field_value_present?(field)
    provenance_for(field)&.status
  end

  # Whether an import from `source` may write this field: never over a value
  # a human has checked against another source.
  def provenance_writable?(field, source)
    row = provenance_for(field)
    row.nil? || row.status != "sourced" || row.source == source.to_s || !field_value_present?(field)
  end

  # Upserts the provenance of `fields` (status « empty » for blank values).
  def record_provenance!(fields, source:, upstream_source: nil, license: nil, url: nil, status: "to_verify")
    fields = Array(fields).map(&:to_s)
    return if fields.empty?
    rows = fields.map do |field|
      {
        record_type: self.class.polymorphic_name, record_id: id, field:,
        source: source.to_s, upstream_source: upstream_source.presence, license: license.presence,
        url: url.presence, status: field_value_present?(field) ? status : "empty"
      }
    end
    PlantFieldSource.upsert_all(rows, unique_by: :index_plant_field_sources_uniqueness)
    field_sources.reset
  end

  # { "height_max_m" => { source:, upstreamSource:, license:, url:, status:, updatedAt: } }
  def provenance_json
    self.class.provenanced_fields.each_with_object({}) do |field, json|
      row = provenance_for(field)
      next unless row
      json[field.camelize(:lower)] = row.as_json.merge(status: provenance_status(field))
    end
  end
end
