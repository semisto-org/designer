require "test_helper"

class Catalog::VarietyUsesLoaderTest < ActiveSupport::TestCase
  setup do
    @dir = Rails.root.join("tmp/test_variety_uses_#{Process.pid}")
    FileUtils.mkdir_p(@dir)
  end

  teardown { FileUtils.rm_rf(@dir) }

  test "fills the matching varieties, citing the reference, to verify" do
    variety = plant_species(:apple).varieties.create!(name: "Cabarette / Président Van Dievoet")
    load_entries([ {
      "species" => "Malus domestica", "names" => [ "Président van Dievoet" ],
      "uses" => %w[fresh juice], "picking_month" => 10, "eating_until_month" => 1,
      "upstream_source" => "CRA-W", "url" => "https://example.org/fiche"
    } ]).then { assert_equal({ updated: 1, missing: [] }, _1) }

    variety.reload
    assert_equal %w[fresh juice], variety.uses
    assert_equal 10, variety.picking_month
    row = variety.provenance_for(:uses)
    assert_equal [ "semisto", "CRA-W", "https://example.org/fiche", "to_verify" ], [ row.source, row.upstream_source, row.url, row.status ]
    assert_nil variety.provenance_for(:eating_from_month), "no value, no provenance"
  end

  test "never creates a variety, and says which ones it did not find" do
    assert_no_difference "PlantVariety.count" do
      result = load_entries([ { "species" => "Malus domestica", "names" => [ "Pomme inconnue" ], "uses" => %w[juice] } ])
      assert_equal [ "Pomme inconnue" ], result[:missing]
    end
  end

  test "never overwrites a value someone checked against another source" do
    variety = plant_varieties(:reinette)
    variety.update!(uses: %w[fresh])
    variety.record_provenance!(%w[uses], source: "user", status: "sourced")
    load_entries([ { "species" => "Malus domestica", "names" => [ "Reinette grise" ], "uses" => %w[juice], "eating_until_month" => 4 } ])
    variety.reload
    assert_equal %w[fresh], variety.uses
    assert_equal 4, variety.eating_until_month
  end

  test "every entry of the seed cites its reference and holds known values" do
    entries = Catalog::VarietyUsesLoader.new.entries
    assert entries.any?
    entries.each do |entry|
      name = entry["names"].first
      assert entry["url"].to_s.start_with?("http"), "#{name}: no reference"
      assert entry["upstream_source"].present?, "#{name}: no upstream source"
      assert_empty Array(entry["uses"]) - PlantVariety::USES, "#{name}: unknown use"
      %w[picking_month eating_from_month eating_until_month].each do |field|
        assert_includes [ nil, *PlantVariety::MONTHS ], entry[field], "#{name}: #{field}"
      end
    end
  end

  private
    def load_entries(entries)
      path = @dir.join("fruit.yml")
      File.write(path, entries.to_yaml)
      Catalog::VarietyUsesLoader.new([ path ]).call
    end
end
