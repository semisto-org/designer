module Mcp
  module Tools
    # The values the AI read in the lab reports of a soil sample, proposed
    # for review: each typed result, each other figure (heavy metals,
    # nitrogen…), the lab, its reference and the sampling date wait on the
    # sample until a human keeps or refuses them one by one (panel Sol, tab
    # Points). A new proposal for the same sample replaces the one not yet
    # reviewed. Nothing reaches the sample's results without a human.
    class ProposeSoilResults < Base
      include SoilHelpers

      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          sample_id: { type: "integer", minimum: 1, description: :soil_sample_id },
          report_ids: { type: "array", items: { type: "integer", minimum: 1 }, maxItems: SoilSample::MAX_REPORTS, uniqueItems: true, description: :soil_report_ids },
          results: {
            type: "array", maxItems: SoilSample::RESULT_KEYS.size, description: :soil_results,
            items: {
              type: "object", additionalProperties: false, required: %w[key value],
              properties: {
                key: { type: "string", enum: SoilSample::RESULT_KEYS, description: :soil_result_key },
                value: { type: "number", description: :soil_result_value },
                note: { type: "string", maxLength: 300, description: :soil_result_note }
              }
            }
          },
          other_results: {
            type: "array", maxItems: SoilSample::MAX_OTHER_RESULTS, description: :soil_other_results,
            items: {
              type: "object", additionalProperties: false, required: %w[name value],
              properties: {
                name: { type: "string", minLength: 1, maxLength: 80, description: :soil_other_name },
                value: { type: "string", minLength: 1, maxLength: 40, description: :soil_other_value },
                unit: { type: "string", maxLength: 30, description: :soil_other_unit },
                note: { type: "string", maxLength: 300, description: :soil_result_note }
              }
            }
          },
          lab: { type: "string", maxLength: 160, description: :soil_lab },
          lab_reference: { type: "string", maxLength: 160, description: :soil_lab_reference },
          sampled_on: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: :soil_sampled_on },
          rationale: { type: "string", minLength: 10, maxLength: 2000, description: :soil_rationale }
        },
        required: %w[map_id sample_id rationale]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, sample_id:, rationale:, results: [], other_results: [], report_ids: nil, lab: nil, lab_reference: nil, sampled_on: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        sample = find_sample!(map, sample_id)

        rejected, unchanged = [], []
        kept_results = results.uniq { |r| r[:key] }.filter_map do |result|
          key, value = result[:key], result[:value]
          range = SoilSample::RESULT_FIELDS.fetch(key)[:range]
          unless range.cover?(value)
            rejected << { key:, error: t("errors.soil_out_of_range", min: range.min, max: range.max) }
            next
          end
          if sample.results[key] == value
            unchanged << key
            next
          end
          { "key" => key, "value" => value, "note" => result[:note].presence }.compact
        end
        current_others = sample.other_results.to_h { |o| [ o["name"].downcase, o["value"] ] }
        kept_others = other_results.uniq { |o| o[:name].squish.downcase }.filter_map do |other|
          name = other[:name].squish
          if current_others[name.downcase] == other[:value].squish
            unchanged << name
            next
          end
          { "name" => name, "value" => other[:value].squish, "unit" => other[:unit].presence, "note" => other[:note].presence }.compact
        end
        meta = { "lab" => lab, "lab_reference" => lab_reference, "sampled_on" => sampled_on }
          .select { |field, value| value.present? && sample[field].to_s != value }
        if meta["sampled_on"]
          Date.iso8601(meta["sampled_on"]) rescue raise(ToolError, t("errors.soil_date", value: sampled_on))
        end
        if kept_results.empty? && kept_others.empty? && meta.empty?
          raise ToolError, t("errors.soil_nothing", details: rejected.map { |r| "#{r[:key]} : #{r[:error]}" }.join(" ; ").presence || t("errors.soil_all_known"))
        end

        valid_report_ids = Array(report_ids) & sample.lab_reports.map(&:id)
        sample.update!(results_draft: {
          "results" => kept_results, "other_results" => kept_others, **meta,
          "rationale" => rationale, "report_ids" => valid_report_ids.presence || sample.lab_reports.map(&:id),
          "proposed_at" => Time.current.iso8601, "proposed_by_id" => user.id
        })
        replaces = kept_results.filter_map { |r| { key: r["key"], current: sample.results[r["key"]], proposed: r["value"] } if sample.results.key?(r["key"]) } +
                   kept_others.filter_map { |o| { name: o["name"], current: current_others[o["name"].downcase], proposed: o["value"] } if current_others.key?(o["name"].downcase) }
        {
          sample_id: sample.id, label: sample.label,
          proposed: { results: kept_results.size, other_results: kept_others.size, fields: meta.keys },
          unchanged: unchanged.presence, rejected: rejected.presence, replaces: replaces.presence,
          review_url: soil_url(map),
          next_step: t(replaces.any? ? "notes.review_soil_replacing" : "notes.review_soil", label: sample.label)
        }.compact
      end

      private
        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], sample_id: arguments[:sample_id], results: Array(arguments[:results]).size, other_results: Array(arguments[:other_results]).size }
        end

        def summarize_result(data) = { created: data[:proposed][:results] + data[:proposed][:other_results] + data[:proposed][:fields].size }
    end
  end
end
