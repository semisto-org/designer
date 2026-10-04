module Imports
  module Claudy
    # What an import did, counted as it goes, and its French summary for the
    # person running `bin/rails claudy:import`.
    class Report
      OUTCOMES = %i[created updated unchanged skipped].freeze
      PHOTO_OUTCOMES = %i[created planned known duplicate unsupported too_large failed].freeze
      # The species of a bio-indicator analysis (not a map feature).
      OBSERVATION_KIND = [ nil, "bioindicator_observation" ].freeze

      attr_reader :map, :source_label, :counts, :photos, :skipped, :kept, :unmatched_species,
                  :unmatched_varieties, :warnings, :errors, :unknown_networks
      # sketches_missing: why the source could not list sketches (:api, :file), or nil.
      attr_accessor :palette_created, :sketches_missing, :aborted

      def initialize(map:, source_label:, dry_run: false, photos_enabled: true)
        @map = map
        @source_label = source_label
        @dry_run = dry_run
        @photos_enabled = photos_enabled
        @counts = Hash.new { |hash, key| hash[key] = Hash.new(0) }
        @photos = Hash.new(0)
        @skipped = Hash.new(0)
        @kept = Hash.new(0)
        @unmatched_species = Hash.new(0)
        @unmatched_varieties = Hash.new(0)
        @unknown_networks = Hash.new(0)
        @warnings = []
        @errors = []
        @palette_created = 0
      end

      def dry_run? = @dry_run

      # outcome: :created, :updated, :unchanged or :skipped.
      def count(layer, kind, outcome) = @counts[[ layer, kind ]][outcome] += 1
      def skip(reason, by = 1) = @skipped[reason] += by
      def keep(reason) = @kept[reason] += 1
      def photo(outcome) = @photos[outcome] += 1
      def warn(text) = @warnings << text
      def unknown_network(layer_id) = @unknown_networks[layer_id.to_s] += 1

      def error(type:, id:, name:, message:)
        @errors << I18n.t("claudy_import.report.error_line", type:, id:, name: name.presence || I18n.t("claudy_import.report.unnamed"), message:)
      end

      def total(outcome) = @counts.values.sum { |c| c[outcome] }

      def to_s
        lines = [ I18n.t("claudy_import.report.title", map: map.name, id: map.id), I18n.t("claudy_import.report.source", source: source_label) ]
        lines << I18n.t("claudy_import.report.dry_run") if dry_run?
        lines << ""
        lines.concat(element_lines)
        lines << photo_line
        lines << I18n.t("claudy_import.report.palette", count: palette_created) if palette_created.positive?
        lines.concat(section(:unmatched_species, unmatched_lines(unmatched_species)))
        lines.concat(section(:unmatched_varieties, unmatched_lines(unmatched_varieties)))
        lines.concat(section(:skipped, skipped_lines))
        lines.concat(section(:kept, kept.map { |reason, count| I18n.t("claudy_import.report.kept_reasons.#{reason}", count:) }))
        lines.concat(section(:warnings, all_warnings.map { |text| I18n.t("claudy_import.report.warning_line", text:) }))
        if errors.any?
          lines << "" << I18n.t("claudy_import.report.errors", count: errors.size)
          lines.concat(errors)
        end
        lines.join("\n")
      end

      private
        def element_lines
          return [ I18n.t("claudy_import.report.nothing") ] if counts.empty?
          rows = counts.sort_by { |(layer, kind), _| [ layer.to_s, kind_label(layer, kind) ] }
          [ I18n.t("claudy_import.report.elements") ] + rows.map do |(layer, kind), outcomes|
            text = OUTCOMES.filter_map do |outcome|
              I18n.t("claudy_import.report.counts.#{outcome}", count: outcomes[outcome]) if outcomes[outcome].positive?
            end.join(", ")
            I18n.t("claudy_import.report.kind_line", label: kind_label(layer, kind), counts: text)
          end
        end

        def kind_label(layer, kind)
          return I18n.t("claudy_import.bioindicators.record_label") if [ layer, kind ] == OBSERVATION_KIND
          I18n.t("claudy_import.report.kind_label", kind: MapElements.label(kind), layer: I18n.t("editor.layers.#{layer}"))
        end

        def photo_line
          return I18n.t("claudy_import.report.photos_off") unless @photos_enabled
          text = PHOTO_OUTCOMES.filter_map do |outcome|
            I18n.t("claudy_import.report.photo_counts.#{outcome}", count: photos[outcome]) if photos[outcome].positive?
          end
          text.any? ? I18n.t("claudy_import.report.photos", counts: text.join(", ")) : I18n.t("claudy_import.report.photos_none")
        end

        def unmatched_lines(list)
          list.sort_by { |name, count| [ -count, name ] }.map do |name, count|
            I18n.t("claudy_import.report.unmatched_species_line", name:, count:)
          end
        end

        def skipped_lines
          lines = skipped.map { |reason, count| I18n.t("claudy_import.report.skipped_reasons.#{reason}", count:) }
          lines << I18n.t("claudy_import.report.sketches_missing.#{sketches_missing}") if sketches_missing
          lines
        end

        def all_warnings
          warnings + unknown_networks.map do |layer, count|
            I18n.t("claudy_import.report.unknown_network", layer:, count:)
          end
        end

        def section(key, lines)
          lines.empty? ? [] : [ "", I18n.t("claudy_import.report.#{key}") ] + lines
        end
    end
  end
end
