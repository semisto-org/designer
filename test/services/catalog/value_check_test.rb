require "test_helper"
require_relative "../../test_helpers/jev_test_helper"

class Catalog::ValueCheckTest < ActiveSupport::TestCase
  include JevTestHelper

  PFAF_TEXT = "Ocimum kilimandscharicum is an evergreen Shrub growing to 1.5 m (5ft) by 1 m (3ft). " \
              "It is in flower from June to September, and the seeds ripen from August to October. It cannot grow in the shade."
  WIKI_TEXT = "Ocimum kilimandscharicum, the camphor basil, is a perennial herb native to Kenya, Tanzania and Uganda. " \
              "It is grown for its leaves, which smell of camphor, and is visited by many bees when it flowers in summer. " \
              "The plant is widely cultivated in gardens of East Africa and India."

  setup do
    @species = PlantSpecies.create!(latin_name: "Ocimum kilimandscharicum", review_status: "proposed")
    Catalog::SpeciesWriter.new(source: "terranova", status: "to_verify").write(@species, {
      "plant_type" => "small-shrub", "foliage_type" => "evergreen", "life_cycle" => "perennial", "exposures" => [ "sun" ],
      "edible_parts" => [ "leaf" ], "flowering_months" => [ 6, 7, 8, 9 ], "height_max_m" => 1.0, "growth_rate" => "medium"
    })
    stub_pfaf("Ocimum kilimandscharicum", PFAF_TEXT)
    stub_wikipedia("en", "Ocimum kilimandscharicum", WIKI_TEXT)
    stub_wikipedia("fr", "Ocimum kilimandscharicum")
    stub_jev do |state, questions|
      if state["source"] == "pfaf"
        height = questions.dig("height_max_m", "criteria").find { |_, snippet| snippet.to_s.include?("[value: 1.5 m]") }&.first
        { "foliage_type" => { "choice" => "evergreen", "confidence" => 0.95 },
          "plant_type" => { "choice" => "shrub", "confidence" => 0.9 },
          "life_cycle" => { "choice" => "not_stated", "confidence" => 0.9 },
          "exposures.sun" => { "noul" => 0.92 }, "edible_parts.leaf" => { "noul" => 0.2 },
          "flowering_months.line" => { "choice" => jev_line(state, "in flower"), "confidence" => 0.9 },
          "height_max_m" => { "choice" => height, "confidence" => 0.9 } }
      else
        { "plant_type" => { "choice" => "herbaceous", "confidence" => 0.85 },
          "plant_type.line" => { "choice" => jev_line(state, "perennial herb"), "confidence" => 0.9 },
          "life_cycle" => { "choice" => "perennial", "confidence" => 0.93 },
          "foliage_type" => { "choice" => "deciduous", "confidence" => 0.4 } }
      end
    end
    @check = Catalog::ValueCheck.new(@species, jev: Providers::Jev.new(api_key: "key"))
  end

  test "each value is confirmed, contradicted or left unknown, with its source" do
    @check.run
    checks = @species.value_checks.index_by(&:field)

    assert_equal %w[edible_parts exposures flowering_months foliage_type height_max_m life_cycle plant_type], checks.keys.sort
    assert_equal [ "confirmed", "pfaf", nil ], checks["foliage_type"].values_at(:verdict, :source, :excerpt), "PFAF text is never kept"
    assert_equal [ "confirmed", "wikipedia" ], checks["life_cycle"].values_at(:verdict, :source)
    assert_equal "https://en.wikipedia.org/wiki/Ocimum_kilimandscharicum", checks["life_cycle"].url
    assert_equal "confirmed", checks["exposures"].verdict
    assert_equal "unknown", checks["edible_parts"].verdict
    assert_equal [ "confirmed", [ 6, 7, 8, 9 ] ], checks["flowering_months"].values_at(:verdict, :source_value)
    assert_equal [ "contradicted", 1.5 ], checks["height_max_m"].values_at(:verdict, :source_value)

    habit = checks["plant_type"]
    assert_equal [ "contradicted", "herbaceous", "wikipedia" ], habit.values_at(:verdict, :source_value, :source),
                 "a page that says otherwise outweighs the one that agrees"
    assert_includes habit.excerpt, "perennial herb"
    assert_not_nil @species.reload.values_checked_at
  end

  test "a new check replaces the previous verdicts, and nothing is written to the species" do
    @check.run
    @check.run
    assert_equal 7, @species.value_checks.count
    assert_equal 1.0, @species.reload.height_max_m
    assert_equal "to_verify", @species.provenance_for("height_max_m").status
  end

  test "without a key, Jev says it cannot check" do
    assert_raises(Providers::Jev::Unavailable) { Catalog::ValueCheck.new(@species, jev: Providers::Jev.new(api_key: nil)).run }
  end
end
