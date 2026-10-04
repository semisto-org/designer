require "test_helper"

class Catalog::SeedLoaderTest < ActiveSupport::TestCase
  test "loads the starter catalogue idempotently, as semisto values to verify" do
    before = PlantSpecies.count
    counts = Catalog::SeedLoader.new.call
    assert_operator counts[:created] + counts[:updated], :>=, 80
    loaded = PlantSpecies.count
    assert_operator loaded - before, :>=, 70

    again = Catalog::SeedLoader.new.call
    assert_equal 0, again[:created]
    assert_equal loaded, PlantSpecies.count

    hazel = PlantSpecies.find_by_latin_name("Corylus avellana")
    assert hazel, "hazel is in the starter catalogue"
    assert_equal "semisto", hazel.provenance_for(:height_max_m).source
    assert_equal "to_verify", hazel.provenance_for(:height_max_m).status
    assert hazel.common_name.present?
    assert hazel.hardiness_zone.present?
    assert hazel.min_temperature_c.present?
  end

  test "keeps a value someone sourced elsewhere" do
    Catalog::SeedLoader.new.call
    hazel = PlantSpecies.find_by_latin_name("Corylus avellana")
    hazel.update!(height_max_m: 7.5)
    hazel.record_provenance!(%w[height_max_m], source: "trefle", upstream_source: "usda", status: "sourced")
    Catalog::SeedLoader.new.call
    assert_equal 7.5, hazel.reload.height_max_m.to_f
    assert_equal "trefle", hazel.provenance_for(:height_max_m).source
  end

  test "a re-run never reverts an imported value" do
    Catalog::SeedLoader.new.call
    hazel = PlantSpecies.find_by_latin_name("Corylus avellana")
    hazel.update!(height_max_m: 5.5)
    hazel.record_provenance!(%w[height_max_m], source: "terranova", status: "to_verify")
    Catalog::SeedLoader.new.call
    assert_equal 5.5, hazel.reload.height_max_m.to_f
    assert_equal "terranova", hazel.provenance_for(:height_max_m).source
  end

  test "every seed entry uses canonical vocabulary" do
    entries = Catalog::SeedLoader.new.entries
    assert_equal entries.size, entries.map { |e| e["latin_name"].downcase }.uniq.size, "no duplicate latin names"
    entries.each do |entry|
      assert PlantVocabulary::STRATA.include?(entry["strata"]), "#{entry['latin_name']}: strata"
      PlantSpecies::LIST_FACETS.each do |facet|
        unknown = Array(entry[facet.to_s]) - PlantVocabulary.keys(facet)
        assert_empty unknown, "#{entry['latin_name']}: #{facet}"
      end
    end
  end
end
