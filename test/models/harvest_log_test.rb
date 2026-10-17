require "test_helper"

class HarvestLogTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @apple = plant(plant_species(:apple), name: "n° 7 — Pommier")
    @old_apple = plant(plant_species(:apple), name: "n° 8 — Pommier")
    @comfrey = plant(plant_species(:comfrey))
  end

  test "lists the fruit plants, not the herbs, season by season" do
    note(@apple, 2026, 10, stage: "picked", amount: "heavy", uses: %w[juice], quantity_kg: 30)
    note(@apple, 2026, 7, stage: "on_tree", amount: "normal")
    note(@old_apple, 2026, 7, stage: "on_tree", amount: "none")

    log = HarvestLog.new(@map, season: 2026)
    ids = log.plants.map { _1[:featureId] }
    assert_includes ids, @apple.id
    refute_includes ids, @comfrey.id
    assert_equal (2022..2026).to_a, log.seasons

    row = log.plant(@apple.id)
    assert_equal({ status: "picked", amount: "heavy", uses: %w[juice], quantityKg: 30.0 }, row[:seasons][2026])
    assert_equal "none", log.plant(@old_apple.id)[:seasons][2026][:status]
    assert_equal 1, log.totals[:picked]
    assert_equal 1, log.totals[:none]
    assert_equal 30.0, log.totals[:quantityKg]
    assert_equal({ "juice" => 1 }, log.totals[:uses])
  end

  test "a herb with a harvest line is listed too" do
    note(@comfrey, 2026, 6, stage: "picked")
    assert HarvestLog.new(@map, season: 2026).plant(@comfrey.id)
  end

  test "à surveiller only after three followed seasons in a row without fruit" do
    [ 2024, 2025 ].each { note(@apple, _1, 9, stage: "picked") }
    [ 2024, 2025 ].each { note(@old_apple, _1, 9, stage: "on_tree", amount: "none") }
    log = HarvestLog.new(@map, season: 2025)
    assert_equal 2, log.plant(@old_apple.id)[:quietSeasons]
    refute log.plant(@old_apple.id)[:watch]

    note(@apple, 2026, 9, stage: "picked")
    log = HarvestLog.new(@map, season: 2026)
    old = log.plant(@old_apple.id)
    assert_equal 3, old[:quietSeasons]
    assert old[:watch]
    assert_nil old[:lastBore]
    refute log.plant(@apple.id)[:watch]
    assert_equal 2026, log.plant(@apple.id)[:lastBore]
    assert_equal [ 2024, 2025, 2026 ], log.followed_seasons
  end

  test "an alternating tree is not flagged" do
    [ 2024, 2026 ].each { note(@old_apple, _1, 9, stage: "picked") }
    note(@apple, 2025, 9, stage: "picked")
    assert_equal 0, HarvestLog.new(@map, season: 2026).plant(@old_apple.id)[:quietSeasons]
  end

  test "a young tree is not blamed before it can bear" do
    plant_species(:apple).update!(production_start_year: 4)
    young = plant(plant_species(:apple), planted_on: Date.new(2024, 11, 20))
    [ 2024, 2025, 2026 ].each { note(@apple, _1, 9, stage: "picked") }
    row = HarvestLog.new(@map, season: 2026).plant(young.id)
    assert_equal 2028, row[:bearingFrom]
    assert_equal 0, row[:quietSeasons]
    refute row[:watch]
  end

  private
    def plant(species, name: nil, planted_on: nil)
      properties = { "species_id" => species.id, "planted_on" => planted_on&.iso8601 }.compact
      @map.features.create!(layer: "plants", kind: "plant", name:, geometry: point, properties:)
    end

    def note(feature, year, month, **attributes)
      feature.plant_harvests.create!(noted_on: Date.new(year, month, 15), **attributes)
    end
end
