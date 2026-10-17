require "test_helper"

# What a map says about its growing conditions, and how each species fits.
class PlantFitTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    regions(:wallonia).update!(settings: { "climate" => { "hardiness_zone" => 7 } })
  end

  def site = PlantFit::Site.new(Map.find(@map.id))

  def sheet!(constraints: {}, livestock: nil)
    project = { "constraints" => constraints }
    project["livestock"] = { "species" => livestock } if livestock
    @map.update!(project:)
  end

  def patch!(exposure)
    @map.features.create!(layer: "plants", kind: "patch", geometry: square(lng: 4.904, lat: 50.3395, size: 0.0002),
                          properties: { "exposure" => exposure })
  end

  def statuses(species) = site.fit(species).criteria.to_h { |c| [ c.key, c.status ] }

  test "with nothing known but the zone, only hardiness is judged" do
    assert_equal({ "hardiness" => "fits" }, statuses(plant_species(:apple)))
    assert_equal "fits", site.fit(plant_species(:apple)).tier
  end

  test "an unknown value is « unknown », never a fit" do
    plant_species(:apple).update!(hardiness_zone: nil, min_temperature_c: nil)
    fit = site.fit(plant_species(:apple))
    assert_equal "unknown", fit.criteria.first.status
    assert_equal "unknowns", fit.tier
    assert_nil site.excluded_by(plant_species(:apple)), "unknown hardiness does not rule a species out"
  end

  test "patch exposures, sheet moisture and soil type are judged" do
    patch!("shade")
    sheet!(constraints: { "soil" => %w[wet clay] })
    apple = statuses(plant_species(:apple))
    assert_equal "misfit", apple["exposure"], "an apple tree wants sun"
    assert_equal "partial", apple["moisture"], "moist soil, not wet"
    assert_equal "unknown", apple["soil_type"]
    assert_equal "one_misfit", site.fit(plant_species(:apple)).tier

    comfrey = statuses(plant_species(:comfrey))
    assert_equal "fits", comfrey["exposure"]
    assert_equal "unknown", comfrey["moisture"]
  end

  test "soil analyses outrank the sheet for soil type and pH" do
    sheet!(constraints: { "soil" => %w[sandy acidic] })
    assert_equal %w[sandy], site.signals["soil_type"].values
    assert_equal %w[acidic], site.signals["ph"].values
    assert_equal "sheet", site.signals["ph"].origin

    @map.soil_samples.create!(label: "S1", results: { "ph_water" => 7.9, "sand_pct" => 20, "silt_pct" => 30, "clay_pct" => 50 })
    assert_equal %w[clay], site.signals["soil_type"].values
    assert_equal %w[alkaline], site.signals["ph"].values
    assert_equal "soil_samples", site.signals["ph"].origin

    plant_species(:apple).update!(soil_ph: %w[neutral])
    assert_equal "partial", statuses(plant_species(:apple))["ph"]
    plant_species(:apple).update!(soil_ph: %w[acidic])
    assert_equal "misfit", statuses(plant_species(:apple))["ph"]
  end

  test "known facts rule a species out: hardiness, invasive, toxic for the project's animals" do
    assert_equal "hardiness", site.excluded_by(plant_species(:rosemary))
    assert_equal "invasive", site.excluded_by(plant_species(:robinia))
    plant_species(:comfrey).update!(toxic_for: %w[poultry])
    assert_nil site.excluded_by(plant_species(:comfrey))
    sheet!(livestock: %w[chickens])
    assert_equal "toxic", site.excluded_by(plant_species(:comfrey))
  end

  test "a criterion resting on a checked value is marked verified" do
    apple = plant_species(:apple)
    apple.record_provenance!(%w[hardiness_zone], source: "manual", status: "sourced")
    assert site.fit(PlantSpecies.find(apple.id)).criteria.first.verified
    apple.record_provenance!(%w[hardiness_zone], source: "manual", status: "to_verify")
    assert_not site.fit(PlantSpecies.find(apple.id)).criteria.first.verified
  end

  test "suggestions keep species of unknown hardiness after the known fits, and skip toxic ones" do
    plant_species(:alder).update!(hardiness_zone: nil)
    sheet!(livestock: %w[sheep])
    plant_species(:comfrey).update!(toxic_for: %w[sheep])
    result = PaletteSuggestions.new(Map.find(@map.id))
    by_name = result.suggestions.to_h { |s| [ s.species.latin_name, s ] }
    assert_equal "unknowns", by_name["Alnus glutinosa"].fit.tier
    assert_not by_name.key?("Symphytum officinale")
    json = result.as_json
    assert_equal 1, json[:excluded][:toxic]
    assert_equal 1, json[:excluded][:invasive]
    assert json[:suggestions].first.key?(:fit)
  end
end
