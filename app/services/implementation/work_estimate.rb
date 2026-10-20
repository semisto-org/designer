# How much work an element of the design takes to build, from
# config/implementation_work.yml: indicative hours by hand, or a job for a
# machine, and the season it is best done in.
#
#   Implementation::WorkEstimate.for_kind("swale", length_m: 40) # => #<Estimate hours=40.0 …>
#   Implementation::WorkEstimate.for_plants("canopy", 3)          # => #<Estimate hours=3.0 …>
module Implementation
  module WorkEstimate
    Estimate = Data.define(:hours, :machine, :season, :per, :quantity) do
      def known? = machine || !hours.nil?
    end

    UNKNOWN = Estimate.new(hours: nil, machine: false, season: "any", per: "each", quantity: 1)

    module_function

    def config = @config ||= YAML.load_file(Rails.root.join("config/implementation_work.yml")).freeze

    # length_m: a line's length (half the outline of a surface, for a hedge
    # drawn as a strip); area_m2: a surface's area; a point counts one.
    def for_kind(kind, length_m: nil, area_m2: nil)
      entry = config["kinds"][kind.to_s] or return UNKNOWN
      season = entry["season"] || "any"
      return Estimate.new(hours: nil, machine: true, season:, per: entry["per"] || "each", quantity: 1) if entry["machine"]
      per = entry["per"] || "each"
      quantity = case per
      when "m" then length_m.to_f
      when "m2" then area_m2.to_f
      else 1
      end
      Estimate.new(hours: (quantity * entry["hours"].to_f).round(1), machine: false, season:, per:, quantity: quantity.round(1))
    end

    def for_plants(strata, count)
      entry = config["plants"][strata.to_s] || config["plants"]["shrub"]
      Estimate.new(hours: (count.to_i * entry["hours"].to_f).round(2), machine: false, season: entry["season"], per: "each", quantity: count.to_i)
    end

    # Months (1-12) of a season; every month for « any ».
    def months(season) = config["seasons"].fetch(season.to_s) { (1..12).to_a }
  end
end
