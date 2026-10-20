require "test_helper"

class Implementation::ProposalTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @map.features.delete_all
  end

  def plant(species)
    @map.features.create!(layer: "plants", kind: "plant", geometry: { type: "Point", coordinates: [ 4.905, 50.34 ] },
                          properties: { "species_id" => species.id })
  end

  def swale
    @map.features.create!(layer: "water", kind: "swale", geometry: { type: "LineString", coordinates: [ [ 4.905, 50.34 ], [ 4.906, 50.34 ] ] },
                          properties: { "planned" => true })
  end

  test "water first, then structure and nitrogen fixers, low layers, fruit trees the next winter" do
    swale
    alder = plant(plant_species(:alder))
    apple = plant(plant_species(:apple))
    comfrey = plant(plant_species(:comfrey))
    result = Implementation::Proposal.new(@map, today: Date.new(2026, 9, 20)).run!
    assert_equal({ created: 4, assigned: 4 }, result)
    phases = @map.implementation_phases.reload.to_a
    assert_equal %w[earth structure understory fruit], phases.map(&:key)
    assert_equal [ Date.new(2026, 9, 20), Date.new(2026, 10, 31) ], [ phases[0].starts_on, phases[0].ends_on ]
    assert_equal [ Date.new(2026, 11, 1), Date.new(2027, 3, 31) ], [ phases[1].starts_on, phases[1].ends_on ]
    assert_equal Date.new(2027, 4, 1), phases[2].starts_on
    assert_equal [ Date.new(2027, 11, 1), Date.new(2028, 3, 31) ], [ phases[3].starts_on, phases[3].ends_on ]
    assert_equal phases[1].id, alder.reload.properties["phase_id"]
    assert_equal phases[3].id, apple.reload.properties["phase_id"]
    assert_equal phases[2].id, comfrey.reload.properties["phase_id"]
  end

  test "a season ending within four weeks waits for the next year" do
    swale
    Implementation::Proposal.new(@map, today: Date.new(2026, 10, 19)).run!
    phase = @map.implementation_phases.reload.sole
    assert_equal [ Date.new(2027, 8, 1), Date.new(2027, 10, 31) ], [ phase.starts_on, phase.ends_on ]
  end

  test "in one go, every woody plant goes in the first winter; running again reuses the phases" do
    @map.update!(project: { "calendar" => { "phasing" => "one_go" } })
    plant(plant_species(:apple))
    Implementation::Proposal.new(@map, today: Date.new(2026, 1, 10)).run!
    phase = @map.implementation_phases.reload.sole
    assert_equal "structure", phase.key
    assert_equal [ Date.new(2026, 1, 10), Date.new(2026, 3, 31) ], [ phase.starts_on, phase.ends_on ]
    plant(plant_species(:apple))
    assert_equal({ created: 0, assigned: 1 }, Implementation::Proposal.new(@map, today: Date.new(2026, 1, 11)).run!)
  end

  test "deleting a phase frees its elements" do
    apple = plant(plant_species(:apple))
    Implementation::Proposal.new(@map).run!
    @map.implementation_phases.reload.sole.destroy!
    assert_nil apple.reload.properties["phase_id"]
  end
end
