module SoilAnalysis
  # What the person's AI read in the lab reports of a soil sample, waiting
  # for a human: each value is kept or refused on its own, and only a kept
  # value reaches the sample. Stored in `soil_samples.results_draft`:
  #
  #   { "results" => [{ "key", "value", "note" }],
  #     "other_results" => [{ "name", "value", "unit", "note" }],
  #     "lab", "lab_reference", "sampled_on", "rationale",
  #     "report_ids" => [...], "proposed_at", "proposed_by_id" }
  #
  # A review names its items: "result:<key>", "other:<name>", "lab",
  # "lab_reference" or "sampled_on".
  class ResultsDraft
    META = %w[lab lab_reference sampled_on].freeze

    def initialize(sample)
      @sample = sample
      @data = sample.results_draft || {}
    end

    def pending? = items.any?

    def results = Array(@data["results"])
    def other_results = Array(@data["other_results"])

    def items
      results.map { |r| "result:#{r["key"]}" } +
        other_results.map { |o| "other:#{o["name"]}" } +
        META.select { |field| @data[field].present? }
    end

    # Keeps the named items: they are written to the sample (its validations
    # apply), then leave the draft. Raises ActiveRecord::RecordInvalid.
    def keep!(names)
      names = Array(names).map(&:to_s) & items
      return @sample if names.empty?
      results_kept = results.select { |r| names.include?("result:#{r["key"]}") }
      others_kept = other_results.select { |o| names.include?("other:#{o["name"]}") }

      @sample.results = @sample.results.merge(results_kept.to_h { |r| [ r["key"], r["value"] ] }) if results_kept.any?
      if others_kept.any?
        replaced = others_kept.map { |o| o["name"].downcase }
        @sample.other_results = @sample.other_results.reject { |o| replaced.include?(o["name"].downcase) } +
                                others_kept.map { |o| o.slice("name", "value", "unit") }
      end
      META.each { |field| @sample[field] = @data[field] if names.include?(field) }
      # A lab result means the sample was taken.
      @sample.status = "sampled" if (results_kept.any? || others_kept.any?) && @sample.status == "planned"
      @sample.results_draft = without(names)
      @sample.save!
      @sample
    end

    # Refuses the named items (all of them without names).
    def refuse!(names = nil)
      @sample.update!(results_draft: names.nil? ? nil : without(Array(names).map(&:to_s)))
      @sample
    end

    def as_inertia
      return nil unless pending?
      current = @sample.results.to_h
      current_others = @sample.other_results.index_by { |o| o["name"].downcase }
      {
        results: results.map { |r| { key: r["key"], value: r["value"], note: r["note"], current: current[r["key"]] } },
        otherResults: other_results.map do |o|
          { name: o["name"], value: o["value"], unit: o["unit"], note: o["note"], current: current_others[o["name"].downcase]&.fetch("value") }
        end,
        lab: @data["lab"].presence, labReference: @data["lab_reference"].presence, sampledOn: @data["sampled_on"].presence,
        rationale: @data["rationale"],
        reports: report_names,
        proposedAt: @data["proposed_at"]
      }
    end

    private
      def without(names)
        data = @data.merge(
          "results" => results.reject { |r| names.include?("result:#{r["key"]}") },
          "other_results" => other_results.reject { |o| names.include?("other:#{o["name"]}") }
        )
        META.each { |field| data.delete(field) if names.include?(field) }
        left = Array(data["results"]).any? || Array(data["other_results"]).any? || META.any? { |field| data[field].present? }
        left ? data : nil
      end

      # The reports the values were read from, by name (a removed report drops out).
      def report_names
        ids = Array(@data["report_ids"]).map(&:to_i)
        @sample.lab_reports.select { |report| ids.include?(report.id) }.map { |report| report.filename.to_s }
      end
  end
end
