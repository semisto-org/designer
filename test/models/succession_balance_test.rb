require "test_helper"

class SuccessionBalanceTest < ActiveSupport::TestCase
  setup do
    @map = Map.create!(name: "Verger", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.001))
    @map.palette_items.create!(species: plant_species(:alder), role: "support")
    @map.palette_items.create!(species: plant_species(:apple), role: "food")
  end

  def plant!(species, **properties)
    @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9002, lat: 50.3401),
                          properties: { "species_id" => species.id }.merge(properties.stringify_keys))
  end

  def balance(today: Date.new(2027, 6, 1)) = SuccessionBalance.new(Map.find(@map.id), today:).as_json

  test "support plants against productive ones in years 1, 5, 15 and 30, as support plants give way" do
    2.times { plant!(plant_species(:apple), planted_on: "2025-11-15") }
    plant!(plant_species(:alder), planted_on: "2025-11-15", training: "chop_and_drop", support_until: 8)
    plant!(plant_species(:alder), planted_on: "2025-11-15", support_until: 3)
    data = balance
    assert_equal "2025-11-15", data[:origin]
    assert_equal [ 1, 5, 15, 30 ], data[:years].map { |y| y[:year] }
    assert_equal [ 2025, 2029, 2039, 2054 ], data[:years].map { |y| y[:calendarYear] }
    assert_equal [ 2, 1, 0, 0 ], data[:years].map { |y| y[:support] }
    assert_equal [ 2, 2, 2, 2 ], data[:years].map { |y| y[:productive] }
    assert_equal 0.5, data[:years].first[:share]
    assert_equal 2, data[:supportTotal]
    assert_empty data[:advice]
  end

  test "what to do outside: chop and drop, and the support plants whose time has come" do
    plant!(plant_species(:apple), planted_on: "2024-11-15")
    plant!(plant_species(:alder), planted_on: "2024-11-15", training: "chop_and_drop")
    plant!(plant_species(:alder), planted_on: "2024-11-15", support_until: 3)
    plant!(plant_species(:alder))
    actions = balance[:actions].index_by { |a| a[:key] }
    assert_equal 1, actions["chop_and_drop"][:count]
    assert_equal({ key: "give_way", count: 1, year: 2027 }, actions["give_way"])
    assert_equal 1, actions["unscheduled"][:count], "a support plant still to plant, with no fate yet"
  end

  test "the sheet overrides the palette, and plants without a woody strata or with a hedge role count on neither side" do
    plant!(plant_species(:alder), succession: "productive")
    plant!(plant_species(:apple), succession: "support")
    @map.palette_items.find_by(species: plant_species(:apple)).update!(role: "hedge")
    plant!(plant_species(:apple))
    first = balance[:years].first
    assert_equal [ 1, 1 ], [ first[:support], first[:productive] ]
  end

  test "the companion speaks up when the start lacks support plants, or when they never leave" do
    5.times { plant!(plant_species(:apple)) }
    assert_equal [ "no_support" ], balance[:advice]
    plant!(plant_species(:alder))
    assert_equal [ "few_support" ], balance[:advice]
    5.times { plant!(plant_species(:alder)) }
    assert_equal [ "support_stays" ], balance[:advice]
  end

  test "an empty map has nothing to say" do
    data = balance
    assert_equal [ nil ], data[:years].map { |y| y[:share] }.uniq
    assert_empty data[:actions]
    assert_empty data[:advice]
  end

  test "a patch's trees and shrubs count from today, with their palette role" do
    patch = @map.features.create!(layer: "plants", kind: "patch", geometry: square(lng: 4.9002, lat: 50.3402, size: 0.0001))
    patch.patch_items.create!(species: plant_species(:alder), count: 3)
    patch.patch_items.create!(species: plant_species(:apple), count: 6)
    first = SuccessionBalance.new(Map.find(@map.id)).as_json[:years].first
    assert_equal [ 3, 6 ], [ first[:support], first[:productive] ]
  end
end
