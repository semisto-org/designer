require "test_helper"

class Catalog::TerranovaImportTest < ActiveSupport::TestCase
  BASE = "https://terranova.test/api/v1".freeze

  setup do
    @provider = Providers::Terranova.new(url: BASE, token: "secret")
    stub_page("plant/genera", 1, "genera.json")
    stub_page("plant/species", 1, "species_page1.json")
    stub_page("plant/species", 2, "species_page2.json")
    stub_page("plant/varieties", 1, "varieties.json")
  end

  test "imports genera, species and varieties with terranova provenance" do
    result = Catalog::TerranovaImport.new(provider: @provider).call

    assert_equal 2, result.genera
    assert_equal 3, result.species_created
    assert_equal 1, result.varieties
    assert_equal 1, result.skipped, "the orphan variety is skipped"
    assert_empty result.errors

    elder = PlantSpecies.find_by!(terranova_id: 101)
    assert_equal "Sambucus nigra", elder.latin_name
    assert_equal "Sambucus", elder.genus.latin_name
    assert_equal "Sureau", elder.genus.common_name
    assert_equal [ "Sureau noir", "Grand sureau" ], elder.common_names.map(&:name)
    assert_equal 3.0, elder.height_min_m.to_f
    assert_equal 7.0, elder.height_max_m.to_f
    assert_equal 4.0, elder.spread_max_m.to_f
    assert_equal 4, elder.hardiness_zone
    assert_equal(-30.0, elder.min_temperature_c.to_f)
    assert_equal %w[sun partial-shade], elder.exposures
    assert_equal %w[flower fruit], elder.edible_parts
    assert_equal %w[mellifere birds], elder.eco_services
    assert_equal [ 5, 6 ], elder.flowering_months
    assert_equal [ 8, 9 ], elder.harvest_months
    assert_equal [ 2 ], elder.pruning_months
    assert_equal [ "humans" ], elder.toxic_for
    assert_equal %w[BE FR], elder.native_countries
    assert_nil elder.medicinal_rating, "0 is not a rating"
    assert_equal "shrub", elder.plant_type, "an audited row keeps its column defaults"
    assert_equal [ "moist" ], elder.soil_moisture

    provenance = elder.provenance_for(:height_max_m)
    assert_equal "terranova", provenance.source
    assert_equal "to_verify", provenance.status
    assert_equal "terranova", elder.provenance_for(:min_temperature_c).source

    goumi = PlantSpecies.find_by!(terranova_id: 102)
    assert_equal 3, goumi.hardiness_zone
    assert_equal(-40.0, goumi.min_temperature_c.to_f, "derived from the zone")
    assert_equal [ "nitrogen" ], goumi.eco_services
    assert_equal [ "dry" ], goumi.soil_moisture
    assert_equal 2, goumi.watering_need

    variety = PlantVariety.find_by!(terranova_id: 501)
    assert_equal "Haschberg", variety.name
    assert_equal elder, variety.species
    assert_equal "self-fertile", variety.fertility
    assert_equal "fin août", variety.ripening
    assert_equal "terranova", variety.provenance_for(:taste_rating).source
  end

  test "an unassessed row keeps column defaults as unknown" do
    Catalog::TerranovaImport.new(provider: @provider).call
    shell = PlantSpecies.find_by!(terranova_id: 103)
    assert_nil shell.plant_type
    assert_nil shell.foliage_type
    assert_nil shell.fertility
    assert_nil shell.watering_need
    assert_empty shell.soil_moisture
    assert_nil shell.hardiness_zone
    assert_equal "Elaeagnus", shell.genus.latin_name
  end

  test "never imports free text" do
    Catalog::TerranovaImport.new(provider: @provider).call
    texts = PlantSpecies.pluck(:latin_name) + PlantCommonName.pluck(:name) + PlantVariety.pluck(:ripening, :productivity).flatten.compact
    assert texts.none? { |text| text.include?("ne jamais importer") }
  end

  test "is idempotent and never overwrites a value sourced elsewhere" do
    Catalog::TerranovaImport.new(provider: @provider).call
    elder = PlantSpecies.find_by!(terranova_id: 101)
    elder.update!(height_max_m: 6.5)
    elder.record_provenance!(%w[height_max_m], source: "trefle", upstream_source: "usda", status: "sourced")

    result = Catalog::TerranovaImport.new(provider: @provider).call
    assert_equal 0, result.species_created
    assert_equal 3, result.species_updated
    assert_equal 3, PlantSpecies.where.not(terranova_id: nil).count
    elder.reload
    assert_equal 6.5, elder.height_max_m.to_f
    assert_equal "trefle", elder.provenance_for(:height_max_m).source
    assert_equal 2, elder.common_names.count
  end

  test "matches an existing species by latin name" do
    existing = PlantSpecies.create!(latin_name: "Sambucus nigra", plant_type: "shrub")
    Catalog::TerranovaImport.new(provider: @provider).call
    assert_equal 101, existing.reload.terranova_id
  end

  test "refuses to run without a token" do
    provider = Providers::Terranova.new(url: BASE, token: nil)
    assert_not provider.configured?
    assert_raises(Providers::Terranova::Unavailable) { Catalog::TerranovaImport.new(provider:).call }
  end

  test "an API error is reported as unavailable" do
    stub_request(:get, "#{BASE}/plant/genera").with(query: hash_including({})).to_return(status: 502, body: "")
    assert_raises(Providers::Terranova::Unavailable) { Catalog::TerranovaImport.new(provider: @provider).call }
  end

  test "sends the bearer token" do
    Catalog::TerranovaImport.new(provider: @provider).call
    assert_requested :get, "#{BASE}/plant/species?page=2&per_page=200", headers: { "Authorization" => "Bearer secret" }
  end

  private
    def stub_page(path, page, file)
      stub_request(:get, "#{BASE}/#{path}").with(query: { page: page.to_s, per_page: "200" })
        .to_return(status: 200, body: file_fixture("terranova/#{file}").read, headers: { "Content-Type" => "application/json" })
    end
end
