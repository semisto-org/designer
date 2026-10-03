require "test_helper"
require_relative "../test_helpers/soil_photos_helper"

class SoilSampleTest < ActiveSupport::TestCase
  include SoilPhotosHelper

  def sample(**attrs) = maps(:ahinvaux).soil_samples.new(label: "Verger nord", **attrs)

  test "a sampling point is planned at 0-20 cm by default" do
    sample = sample(location: [ 4.907, 50.341 ])
    sample.save!
    assert_equal "planned", sample.status
    assert_equal "0–20 cm", sample.depth_label
    assert_not sample.analysed?
    assert_equal [ 4.907, 50.341 ], sample.reload.lnglat
    assert_includes SoilSample.located, sample
  end

  test "needs a label and ordered depths" do
    assert_not sample(label: "").valid?
    bad = sample(depth_from_cm: 20, depth_to_cm: 20)
    assert_not bad.valid?
    assert bad.errors.of_kind?(:depth_to_cm, :greater_than)
    assert sample(depth_from_cm: 20, depth_to_cm: 40).valid?
    assert_not sample(depth_to_cm: 500).valid?
  end

  test "results are typed: decimal commas read, unknown keys dropped, blanks ignored" do
    sample = sample(results: { "ph_water" => "6,4", "organic_matter_pct" => "3.8", "clay_pct" => "", "bogus" => "1", "p_mg_100g" => 5 })
    assert sample.valid?
    assert_equal({ "ph_water" => 6.4, "organic_matter_pct" => 3.8, "p_mg_100g" => 5.0 }, sample.results)
    assert sample.analysed?
  end

  test "refuses unreadable and out-of-range figures, in French" do
    sample = sample(results: { "ph_water" => "acide", "organic_matter_pct" => 140 })
    assert_not sample.valid?
    text = sample.errors.full_messages.to_sentence
    assert_includes text, "« pH eau » n'est pas un nombre."
    assert_includes text, "« Matière organique » doit être compris entre 0 et 100."
  end

  test "sand, silt and clay must be consistent" do
    assert sample(results: { "sand_pct" => 20, "silt_pct" => 65, "clay_pct" => 15 }).valid?
    assert sample(results: { "sand_pct" => 20, "silt_pct" => 65 }).valid?
    bad = sample(results: { "sand_pct" => 50, "silt_pct" => 50, "clay_pct" => 50 })
    assert_not bad.valid?
    assert_includes bad.errors.full_messages.to_sentence, "doivent faire 100 %"
    assert_not sample(results: { "sand_pct" => 60, "silt_pct" => 60 }).valid?
  end

  test "the lab report must be a PDF" do
    ok = sample
    ok.lab_report.attach(io: file_fixture("rapport_labo.pdf").open, filename: "rapport.pdf", content_type: "application/pdf")
    assert ok.valid?

    wrong = sample
    wrong.lab_report.attach(io: file_fixture("terrain.jpg").open, filename: "photo.jpg", content_type: "image/jpeg")
    assert_not wrong.valid?
    assert_includes wrong.errors.full_messages.to_sentence, "n'est pas un PDF"
  end

  test "payload hides the reading unless the plan has analyses" do
    sample = sample(results: { "ph_water" => 5.0 })
    sample.save!
    free = sample.as_inertia(analyses: false)
    assert_nil free[:interpretation]
    assert_equal({ "ph_water" => 5.0 }, free[:results])
    paid = sample.as_inertia(analyses: true)
    assert_equal "low", paid[:interpretation][:parameters].first[:band]
  end

  test "deleting the map deletes its soil data" do
    map = Map.create!(name: "Jetable", owner: users(:bob), region: regions(:wallonia))
    map.soil_samples.create!(label: "A")
    map.bioindicator_observations.create!(species_name: "Ortie")
    assert_difference [ -> { SoilSample.count }, -> { BioindicatorObservation.count } ], -1 do
      map.destroy!
    end
  end
end

class BioindicatorObservationTest < ActiveSupport::TestCase
  def observation(**attrs) = maps(:ahinvaux).bioindicator_observations.new(**attrs)

  test "a curated plant fills in its names and says what it indicates" do
    obs = observation(catalog_key: "plantain_majeur")
    assert obs.valid?
    assert_equal "Plantain majeur", obs.species_name
    assert_equal "Plantago major", obs.latin_name
    assert_equal %w[compaction trampled], obs.indicators
    assert_equal "semisto, à vérifier", obs.as_inertia[:provenance]
  end

  test "a plant outside the list is free text and indicates nothing" do
    obs = observation(species_name: "Plante inconnue du coin", abundance: "frequent")
    assert obs.valid?
    assert_empty obs.indicators
  end

  test "needs a name and a known abundance and catalog key" do
    assert_not observation.valid?
    assert_not observation(species_name: "X", abundance: "énorme").valid?
    assert_not observation(species_name: "X", catalog_key: "nope").valid?
  end

  test "works while the plant catalogue does not exist" do
    obs = observation(species_name: "Ortie", plant_species_id: 42)
    assert obs.valid?
    assert_nil obs.plant_species
    assert_not SoilAnalysis::SpeciesLookup.available?
    assert_empty SoilAnalysis::SpeciesLookup.search("ortie")
  end
end
