require "test_helper"

# The planting rounds of the phone: the plants still to plant, and the spring
# take check of the young ones.
class PlantingRoundTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @map.features.where(kind: "plant").delete_all
    @apple = plant_species(:apple)
  end

  def plant!(planted_on: nil, precision: nil)
    @map.features.create!(layer: "plants", kind: "plant", geometry: point,
                          properties: { "species_id" => @apple.id, "planted_on" => planted_on, "planted_on_precision" => precision }.compact)
  end

  def check!(plant, on, survival)
    plant.plant_observations.create!(observed_on: on, kind: "follow_up", survival:, user: users(:michael))
  end

  test "the take season starts on the 1st of March, and the phone offers it until September" do
    assert_equal Date.new(2026, 3, 1), PlantingRound.take_since(Date.new(2026, 11, 16))
    assert_equal Date.new(2025, 3, 1), PlantingRound.take_since(Date.new(2026, 2, 10))
    assert PlantingRound.new(@map, today: Date.new(2026, 4, 1)).open?
    assert_not PlantingRound.new(@map, today: Date.new(2026, 11, 16)).open?
  end

  test "a young plant is due once a spring, for two springs, unless it was found dead or nobody knows when it went in" do
    autumn = plant!(planted_on: "2025-11-20")
    old = plant!(planted_on: "2024-02-01")
    two_springs = plant!(planted_on: "2024-11-10")
    unknown = plant!(planted_on: "2025-11-01", precision: "unknown")
    after = plant!(planted_on: "2026-03-20")
    dead = plant!(planted_on: "2025-01-15")
    planned = plant!
    check!(dead, "2025-05-01", "dead")

    round = PlantingRound.new(@map, today: Date.new(2026, 4, 10))
    assert_equal [ autumn, two_springs ].map(&:id).sort, round.take_due.pluck(:id).sort
    assert_equal [ planned.id ], round.to_plant.pluck(:id)
    assert_not_includes round.take_due, old
    assert_not_includes round.take_due, unknown
    assert_not_includes round.take_due, after

    check!(two_springs, "2025-04-20", "struggling")
    check!(autumn, "2026-04-05", "established")
    json = PlantingRound.new(@map, today: Date.new(2026, 4, 10)).take_json
    assert_equal [ { id: two_springs.id, lastObservedOn: "2025-04-20", lastSurvival: "struggling" } ], json[:due]
    assert json[:open]

    summary = PlantingRound.new(@map, today: Date.new(2026, 4, 10)).as_json
    assert_equal 1, summary[:to_plant]
    assert_equal({ "established" => 1, "struggling" => 0, "dead" => 0 }, summary[:take][:checked])
    assert_equal 1, summary[:take][:due]
  end
end
