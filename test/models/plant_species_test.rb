require "test_helper"

class PlantSpeciesTest < ActiveSupport::TestCase
  test "hardiness: the missing half is derived" do
    from_zone = PlantSpecies.create!(latin_name: "Testus zonus", hardiness_zone: 6)
    assert_equal(-23.2, from_zone.min_temperature_c.to_f)
    from_temperature = PlantSpecies.create!(latin_name: "Testus frigidus", min_temperature_c: -21)
    assert_equal 6, from_temperature.hardiness_zone
  end

  test "values must be canonical" do
    species = PlantSpecies.new(latin_name: "Testus wrongus", exposures: [ "lune" ], harvest_months: [ 13 ], strata: "sky", invasive_countries: [ "belgique" ])
    assert_not species.valid?
    assert species.errors.of_kind?(:exposures, :inclusion)
    assert species.errors.of_kind?(:harvest_months, :inclusion)
    assert species.errors.of_kind?(:strata, :inclusion)
    assert species.errors.of_kind?(:invasive_countries, :invalid)
  end

  test "latin name is unique without case and searchable without accents" do
    assert_not PlantSpecies.new(latin_name: "malus domestica").valid?
    assert_equal [ plant_species(:apple) ], PlantSpecies.matching("pommier").to_a
    assert_equal [ plant_species(:apple) ], PlantSpecies.matching("reinette").to_a, "cultivar names match"
    assert_equal [ plant_species(:comfrey) ], PlantSpecies.matching("CONSOUDE").to_a
  end

  test "default strata, predicates and crown" do
    assert_equal "sub_canopy", plant_species(:apple).default_strata
    assert_equal "shrub", PlantSpecies.new(plant_type: "small-shrub").default_strata
    assert plant_species(:alder).nitrogen_fixer?
    assert plant_species(:robinia).invasive_in?("be")
    assert plant_species(:strawberry).native_in?("BE")
    assert_equal 4.0, plant_species(:apple).adult_spread.metres
    assert_not plant_species(:apple).adult_spread.indicative?
    robinia = plant_species(:robinia).adult_spread
    assert robinia.indicative?
    assert_equal 8.0, robinia.metres
  end

  test "provenance: badges per field, empty when blank, sourced values protected" do
    apple = plant_species(:apple)
    assert_equal "sourced", apple.provenance_status(:height_max_m)
    assert_equal "empty", apple.provenance_status(:pruning_months)
    assert_nil apple.provenance_status(:exposures)
    assert_not apple.provenance_writable?(:height_max_m, "terranova")
    assert apple.provenance_writable?(:height_max_m, "trefle")
    assert apple.provenance_writable?(:hardiness_zone, "terranova"), "a to_verify value may be replaced"

    apple.record_provenance!(%w[exposures pruning_months], source: "pfaf")
    json = apple.reload.provenance_json
    assert_equal "pfaf", json["exposures"][:source]
    assert_equal "PFAF, usage non commercial", json["exposures"][:license]
    assert_equal "to_verify", json["exposures"][:status]
    assert_equal "empty", json["pruningMonths"][:status]
  end

  test "field source validates its keys" do
    source = PlantFieldSource.new(record: plant_species(:alder), field: "height_max_m", source: "Not a key!", status: "maybe", url: "javascript:alert(1)")
    assert_not source.valid?
    assert source.errors.include?(:source)
    assert source.errors.include?(:status)
    assert source.errors.include?(:url)
  end

  test "sheet JSON" do
    sheet = plant_species(:apple).sheet_json
    assert_equal "Malus", sheet[:genus]
    assert_equal [ "Pommier" ], sheet[:commonNames]
    assert_equal 2, sheet[:varieties].size
    assert_equal "Malus domestica 'Belle de Boskoop'", sheet[:varieties].first[:latinName]
    assert_equal "trefle", sheet[:provenance]["heightMaxM"][:source]
  end

  test "palette use protects a species from deletion" do
    maps(:ahinvaux).palette_items.create!(species: plant_species(:alder))
    assert_not plant_species(:alder).destroy
  end
end
