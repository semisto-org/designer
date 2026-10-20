require "test_helper"

class Implementation::PlanTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @map.features.delete_all
    @apple = plant_species(:apple)
    @alder = plant_species(:alder)
  end

  def plant(species, planted_on: nil, **properties)
    @map.features.create!(layer: "plants", kind: "plant", geometry: { type: "Point", coordinates: [ 4.905, 50.34 ] },
                          properties: { "species_id" => species.id, "planted_on" => planted_on }.compact.merge(properties))
  end

  def swale(**properties)
    # About 71 m along the parallel at 50.34° N.
    @map.features.create!(layer: "water", kind: "swale", geometry: { type: "LineString", coordinates: [ [ 4.905, 50.34 ], [ 4.906, 50.34 ] ] },
                          properties: { "planned" => true }.merge(properties))
  end

  test "lists the work still to do, with hours by kind and by strata" do
    swale
    plant(@apple)
    plant(@alder)
    plant(@apple, planted_on: "2025-11-20")
    plan = Implementation::Plan.new(@map).as_json
    groups = plan[:unassigned][:groups]
    swale_group = groups.find { _1[:kind] == "swale" }
    assert_in_delta 71, swale_group[:quantity], 1
    assert_in_delta 71, swale_group[:hours], 1
    assert_equal 2, groups.count { _1[:kind] == "plant" }
    assert_equal 0.8, groups.find { _1[:label] == @apple.common_name }[:hours] # sub_canopy
    assert_equal 3, plan[:totals][:count]
  end

  test "a phase counts its elements, done or not, its cost and its advice" do
    phase = @map.implementation_phases.create!(name: "Hiver", starts_on: Date.new(2026, 6, 1), ends_on: Date.new(2026, 6, 30), other_costs_cents: 5_000)
    @map.palette_items.create!(species: @apple, unit_price: 25)
    plant(@apple, "phase_id" => phase.id)
    plant(@apple, planted_on: "2026-06-10", "phase_id" => phase.id)
    @map.update!(project: { "time" => { "hours_per_week" => 0, "seasons" => [ "winter" ] } })
    summary = Implementation::Plan.new(@map.reload).as_json[:phases].first
    assert_equal 2, summary[:count]
    assert_equal 1, summary[:done]
    assert_equal 5_000 + 2 * 2_500, summary[:costCents]
    codes = summary[:advice].map { _1[:code] }
    assert_includes codes, "season" # a tree in June
    assert_includes codes, "availability" # only free in winter
    assert_includes codes, "time"
  end

  test "counts design elements drawn as if they were already there" do
    swale("planned" => nil)
    plan = Implementation::Plan.new(@map).as_json
    assert_equal 1, plan[:drawnAsExisting].size
    assert_empty plan[:unassigned][:groups]
  end

  test "a machine job has no hours and says so" do
    @map.features.create!(layer: "water", kind: "pond", properties: { "planned" => true },
                          geometry: { type: "Polygon", coordinates: [ [ [ 4.905, 50.34 ], [ 4.9052, 50.34 ], [ 4.9052, 50.3402 ], [ 4.905, 50.3402 ], [ 4.905, 50.34 ] ] ] })
    hours = Implementation::Plan.new(@map).as_json[:unassigned][:hours]
    assert_equal 1, hours[:machine]
    assert_equal 0, hours[:estimated]
  end
end
