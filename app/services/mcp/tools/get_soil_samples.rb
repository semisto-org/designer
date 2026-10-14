module Mcp
  module Tools
    # The soil sampling points of a map (panel Sol, tab Points): where and
    # when they were taken, the lab, the results already entered, the lab
    # reports attached (to read with get_soil_report) and whether values
    # proposed earlier still wait for review. Also the typed result fields,
    # with their units, for propose_soil_results.
    class GetSoilSamples < Base
      include SoilHelpers

      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        samples = map.soil_samples.ordered.with_attached_lab_reports.to_a
        {
          map_id: map.id, url: soil_url(map),
          samples: samples.map { |sample| sample_json(sample) },
          result_fields: soil_fields,
          units_note: t("notes.soil_units"),
          next_step: t(samples.any? { |s| s.lab_reports.attached? } ? "notes.read_soil_reports" : "notes.no_soil_reports")
        }
      end

      private
        def summarize_result(data) = { samples: data[:samples].size, reports: data[:samples].sum { |s| s[:reports].size } }
    end
  end
end
