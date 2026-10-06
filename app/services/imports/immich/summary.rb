module Imports
  module Immich
    # The French summary of an Importer::Result, for the person running
    # `bin/rails immich:import`.
    class Summary
      def initialize(result)
        @result = result
      end

      def to_s
        lines = [ I18n.t(@result.dry_run ? "immich_import.summary.title_dry_run" : "immich_import.summary.title",
                         album: @result.album_name, id: @result.map.id, map: @result.map.name) ]
        Importer::OUTCOMES.each do |outcome|
          count = @result.counts[outcome]
          next unless count.positive?
          lines << I18n.t("immich_import.summary.#{outcome}", count:)
          lines << I18n.t("immich_import.summary.located", count: @result.located) if outcome == :created
        end
        lines << I18n.t("immich_import.summary.nothing") if @result.counts.values.sum.zero?
        @result.warnings.each { |warning| lines << "  ! #{warning}" }
        lines.join("\n")
      end
    end
  end
end
