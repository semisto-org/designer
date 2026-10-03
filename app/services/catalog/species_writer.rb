module Catalog
  # Writes catalogue values coming from one source (a seed, an importer) and
  # records their provenance, field by field.
  #
  # Rules shared by every source:
  # - a blank value never erases a known one (unknown is not « none »);
  # - a value a human checked against another source (status « sourced ») is
  #   never overwritten;
  # - every written field gets a provenance row for this source.
  class SpeciesWriter
    attr_reader :source, :status, :upstream_source, :license, :url

    def initialize(source:, status: "to_verify", upstream_source: nil, license: nil, url: nil)
      @source = source.to_s
      @status = status
      @upstream_source = upstream_source
      @license = license
      @url = url
    end

    # `attributes`: { field => canonical value }. Returns the written fields.
    def write(record, attributes, common_names: nil, language: "fr", url: self.url)
      written = []
      attributes.each do |field, value|
        field = field.to_s
        next if blank?(value)
        next unless record.provenance_writable?(field, source)
        record[field] = value
        written << field
      end
      derived = derived_hardiness(record, written)
      record.save!
      written |= derived.select { |field| record.field_value_present?(field) }

      if common_names.present? && record.provenance_writable?(:common_names, source)
        names = Array(common_names).map { |n| n.to_s.squish }.reject(&:blank?).uniq(&:downcase)
        if record.common_names.select { |n| n.language == language }.map(&:name) != names
          record.replace_common_names!(names, language:)
        end
        written << "common_names"
      end

      record.record_provenance!(written, source:, upstream_source:, license:, url:, status:)
      written
    end

    private
      def blank?(value) = value.nil? || (value.respond_to?(:empty?) && value.empty?)

      # Zone and temperature derive from each other. When a source gives only
      # one, the other is (re)derived unless it already agrees, and carries
      # the same provenance.
      def derived_hardiness(record, written)
        return [] unless record.respond_to?(:hardiness_zone)
        zone, temperature = record.hardiness_zone, record.min_temperature_c
        if written.include?("hardiness_zone") && !written.include?("min_temperature_c")
          return [] if temperature && PlantVocabulary.zone_for_temperature(temperature) == zone
          return [] unless record.provenance_writable?("min_temperature_c", source)
          record.min_temperature_c = PlantVocabulary.min_temperature_for_zone(zone)
          [ "min_temperature_c" ]
        elsif written.include?("min_temperature_c") && !written.include?("hardiness_zone")
          derived = PlantVocabulary.zone_for_temperature(temperature)
          return [] if zone == derived || !record.provenance_writable?("hardiness_zone", source)
          record.hardiness_zone = derived
          [ "hardiness_zone" ]
        else
          []
        end
      end
  end
end
