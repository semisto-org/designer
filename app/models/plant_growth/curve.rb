# How big a plant is a given number of years after planting: the growth
# curve the 3D view and the editor's time strip draw in the browser
# (app/frontend/relief/growth.ts: growthShare, managedSize, sizeAt), ported
# here so the MCP can tell an AI the same sizes. Both sides are checked
# against the same cases (test/fixtures/files/growth_curve_cases.json): a
# change to one must be made to the other (then: node --experimental-strip-types
# script/growth_curve_cases.ts).
module PlantGrowth
  module Curve
    module_function

    # Size when planted (m): a bare-root whip, a one-year bush, a pot of perennial.
    PLANTING_SIZE = {
      "canopy" => [ 1.6, 0.5 ], "sub_canopy" => [ 1.3, 0.5 ], "shrub" => [ 0.5, 0.35 ], "herbaceous" => [ 0.15, 0.2 ],
      "ground_cover" => [ 0.05, 0.15 ], "vine" => [ 0.6, 0.2 ], "root" => [ 0.1, 0.15 ], "aquatic" => [ 0.2, 0.2 ]
    }.freeze

    POLLARD_HEAD = 2.0
    # The most a pollard, a coppice or a chopped-and-dropped plant reaches between two cuts (height, spread).
    MANAGED_SIZE = { "pollard" => [ POLLARD_HEAD + 3.5, 4.0 ], "coppice" => [ 5.0, 4.0 ], "chop_and_drop" => [ 2.2, 1.8 ] }.freeze
    MANAGED_MATURITY = 10
    CHOP_MATURITY = 3

    GRAFT_FORMS = %w[bush half_standard standard].freeze
    ROOTSTOCK_VIGORS = %w[very_dwarf dwarf semi_dwarf semi_vigorous vigorous].freeze
    GRAFT_TRUNK = { "standard" => 1.8, "half_standard" => 1.4, "bush" => 0.6 }.freeze
    FORM_VIGOR = { "standard" => "vigorous", "half_standard" => "semi_vigorous", "bush" => "semi_dwarf" }.freeze
    TRUNK_RANGE = (0.2..3.0)
    # The most a tree reaches on a weak rootstock (height, spread, years).
    VIGOR_SIZE = {
      "very_dwarf" => [ 2.0, 1.5, 4 ], "dwarf" => [ 3.0, 2.5, 5 ], "semi_dwarf" => [ 4.0, 3.5, 7 ], "semi_vigorous" => [ 5.5, 5.0, 10 ]
    }.freeze
    GRAFT_CROWN = 1.2
    GRAFTED_CROWN_AT_PLANTING = [ 0.6, 0.6 ].freeze

    # Share of the way from planting size to adult size (Chapman-Richards).
    def share(age, maturity_years)
      return 0.0 if age <= 0
      maturity = [ 1, maturity_years ].max
      [ 1.0, ((1 - Math.exp((-3.0 * age) / maturity))**1.3) / 0.93 ].min
    end

    # How the plant is drawn: a tree on its trunk, a bush, a low clump, a mat, a climber.
    def form(strata, plant_type)
      return "climber" if strata == "vine" || plant_type == "climber"
      return "tree" if strata == "canopy" || strata == "sub_canopy" || plant_type == "tree"
      return "bush" if strata == "shrub" || plant_type == "shrub" || plant_type == "small-shrub"
      return "mat" if strata == "ground_cover" || plant_type == "ground-cover"
      "clump"
    end

    def training(form, value)
      %w[tree bush].include?(form) && MANAGED_SIZE.key?(value.to_s) ? value.to_s : "free"
    end

    # A grafted tree's trunk (m) and rootstock vigour, from what its sheet says (PlantableFeature#plant_graft).
    def graft(form, data)
      return nil unless form == "tree" && data
      graft_form = GRAFT_FORMS.include?(data[:form]) ? data[:form] : nil
      given = ROOTSTOCK_VIGORS.include?(data[:vigor]) ? data[:vigor] : nil
      height = data[:trunkHeight].is_a?(Numeric) && data[:trunkHeight].finite? ? data[:trunkHeight].clamp(TRUNK_RANGE.min, TRUNK_RANGE.max) : nil
      return nil unless graft_form || given || height
      trunk = height || (graft_form ? GRAFT_TRUNK[graft_form] : { "vigorous" => GRAFT_TRUNK["standard"], "semi_vigorous" => GRAFT_TRUNK["half_standard"] }.fetch(given, GRAFT_TRUNK["bush"]))
      vigor = given || (graft_form ? FORM_VIGOR[graft_form] : trunk >= GRAFT_TRUNK["standard"] ? "vigorous" : trunk >= 1.2 ? "semi_vigorous" : "semi_dwarf")
      { trunk:, vigor: }
    end

    # The size it reaches as it is kept, and when (height, spread, years).
    def adult(height:, spread:, maturity:, training: "free", graft: nil)
      if (cap = MANAGED_SIZE[training])
        years = training == "chop_and_drop" ? CHOP_MATURITY : MANAGED_MATURITY
        return [ [ height, cap[0] ].min, [ spread, cap[1] ].min, [ maturity, years ].min ]
      end
      if graft
        vigor = VIGOR_SIZE[graft[:vigor]]
        return [
          [ graft[:trunk] + GRAFT_CROWN, vigor ? [ height, vigor[0] ].min : height ].max,
          vigor ? [ spread, vigor[1] ].min : spread,
          vigor ? [ maturity, vigor[2] ].min : maturity
        ]
      end
      [ height, spread, maturity ]
    end

    # Height and spread (m) `age` years after planting, or nil before it is
    # planted and once a support plant gave way (`until_years`).
    def size_at(strata:, height:, spread:, maturity:, age:, training: "free", graft: nil, until_years: nil)
      return nil if age.negative?
      return nil if until_years && age >= until_years
      graft = nil unless training == "free"
      start = graft ? [ graft[:trunk] + GRAFTED_CROWN_AT_PLANTING[0], GRAFTED_CROWN_AT_PLANTING[1] ] : PLANTING_SIZE.fetch(strata.to_s, PLANTING_SIZE["shrub"])
      adult_height, adult_spread, years = adult(height:, spread:, maturity:, training:, graft:)
      adult_height = [ 0.02, adult_height ].max
      adult_spread = [ 0.05, adult_spread ].max
      h0 = [ start[0], adult_height ].min
      s0 = [ start[1], adult_spread ].min
      grown = share(age, years)
      { height: h0 + (adult_height - h0) * grown, spread: s0 + (adult_spread - s0) * grown }
    end
  end
end
