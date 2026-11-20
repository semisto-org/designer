# A plant point's size over the years, for an AI (the MCP's get_feature):
# its adult size and years to maturity (PlantGrowth.inputs, as the 3D view
# and the editor's time strip read them), its age today, and its height and
# spread today and 1, 5, 15 and 30 years after planting (PlantGrowth::Curve,
# the browser's curve). A plant still to plant has no age: its sizes are
# counted from the day it goes into the ground.
module PlantGrowth
  class Projection
    AGES = [ 1, 5, 15, 30 ].freeze

    def initialize(feature, quantities: feature.map.planted_quantities, today: Date.current)
      @feature = feature
      @quantities = quantities
      @today = today
    end

    def as_json(*)
      species = @feature.plant_species_id && PlantSpecies.find_by(id: @feature.plant_species_id)
      return nil unless species

      key = [ species.id, @feature.plant_variety_id ]
      variety = key.last && PlantVariety.find_by(id: key.last)
      strata = @quantities.strata_for(key) || species.default_strata || "shrub"
      inputs = PlantGrowth.inputs(strata:, species:, variety:)
      form = Curve.form(strata, species.plant_type)
      training = Curve.training(form, @feature.plant_training)
      graft = training == "free" ? Curve.graft(form, @feature.plant_graft) : nil
      long_ago = @feature.planted_on_precision == "unknown"
      support_until = @feature.support_plant?(@quantities.palette_role_for(key)) && !long_ago ? @feature.support_until : nil
      planted_on = @feature.known_planted_on
      measures = @feature.plant_measures
      measured = Curve.measured(measures, planted_on:)
      size = ->(age) do
        grown = Curve.size_at(strata:, height: inputs[:heightM], spread: inputs[:spreadM], maturity: inputs[:maturityYears],
                              age:, training:, graft:, until_years: support_until, measured:)
        grown && { height_m: grown[:height].round(2), spread_m: grown[:spread].round(2) }
      end
      age = planted_on && ((@today - planted_on) / 365.25).round(1)

      {
        strata:,
        adult: { height_m: inputs[:heightM], spread_m: inputs[:spreadM], maturity_years: inputs[:maturityYears] },
        indicative: inputs[:indicative],
        crown_form: inputs[:crownForm] || "round",
        # Measured on the plant itself: the sizes below start from it.
        measured: measures && { height_m: measures[:height], crown_width_m: measures[:crown], trunk_girth_cm: measures[:girth], on: measures[:on] }.compact,
        training:,
        planted_on: planted_on&.iso8601,
        planted_long_ago: long_ago,
        age_years: long_ago ? nil : age,
        support_until_years: support_until,
        today: long_ago ? size.(1000) : age && size.([ age, 0 ].max),
        by_age: AGES.to_h { |years| [ years.to_s, size.(years) ] }
      }
    end
  end
end
