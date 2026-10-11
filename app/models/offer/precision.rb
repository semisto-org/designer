class Offer
  # How precise the budget is: what the map, the project sheet and the
  # team's internal sheet already tell the calculation, out of 100, and
  # what is missing to make it more precise, the biggest gain first. An
  # offer on a bare outline is an order of magnitude; the gauge tells the
  # designer which few facts turn it into a budget the client can rely on.
  class Precision
    # key => [weight, where it is filled in]. The weights add up to 100.
    CHECKS = {
      "outline" => [ 15, "map" ],
      "scope" => [ 25, "map" ],
      "client" => [ 10, "sheet" ],
      "budget" => [ 10, "sheet" ],
      "constraints" => [ 15, "sheet" ],
      "complexity" => [ 15, "offer" ],
      "trips" => [ 10, "offer" ]
    }.freeze
    # Project sheet answers the hours and adjustments lean on.
    CONSTRAINTS = %w[soil access slope].freeze
    # Upper bound of each level, in points.
    LEVELS = { "rough" => 39, "range" => 79, "precise" => 100 }.freeze

    def initialize(measures, inputs, pricing, warnings)
      @measures = measures
      @inputs = inputs
      @pricing = pricing
      @warnings = warnings
    end

    def call
      checks = CHECKS.map do |key, (weight, where)|
        done = send("#{key}_done").to_f.clamp(0, 1)
        { "key" => key, "where" => where, "weight" => weight, "done" => done.round(2), "points" => (weight * done).round }
      end
      score = checks.sum { _1["points"] }
      {
        "score" => score,
        "level" => LEVELS.find { |_, up_to| score <= up_to }.first,
        "checks" => checks,
        "missing" => checks.each_with_index.select { |check, _| check["done"] < 1 }
          .sort_by { |check, index| [ check["points"] - check["weight"], index ] }.map { |check, _| check["key"] }
      }
    end

    private
      attr_reader :measures, :inputs, :pricing, :warnings

      def sheet = @sheet ||= measures.map.project_sheet

      def outline_done = measures.site_area_m2.to_f.positive? ? 1 : 0

      # Something drawn and priced, and nothing in it that left the map.
      def scope_done
        scope = measures.scope
        return 0 if scope.empty?
        scope.count { !_1["missing"] } / scope.size.to_f
      end

      def client_done = measures.client_type ? 1 : 0

      def budget_done = sheet.section("budget")["initial"].present? ? 1 : 0

      # « Unknown » is an answer, but it leaves the uncertainty in the price.
      def constraints_done
        section = sheet.section("constraints")
        CONSTRAINTS.count { (Array(section[_1]) - [ "unknown" ]).any? } / CONSTRAINTS.size.to_f
      end

      def complexity_done
        criteria = pricing.complexity["criteria"]
        return 1 if criteria.empty?
        scores = inputs["complexity"] || {}
        criteria.count { scores[_1["key"]] } / criteria.size.to_f
      end

      def trips_done = warnings.any? { _1["code"] == "trip_without_km" } ? 0 : 1
  end
end
