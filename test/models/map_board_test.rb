require "test_helper"
require_relative "../test_helpers/teams_test_helper"

class MapBoardTest < ActiveSupport::TestCase
  setup do
    @team = make_team("Design Labs", admin: users(:michael), members: [ users(:bob) ])
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
  end

  test "a map without a phase reads as design" do
    assert_nil @map.phase
    assert_equal "design", @map.board_phase
  end

  test "changing the phase dates it and wakes the project" do
    @map.update_board!(on_hold: true)
    assert @map.on_hold?
    travel 1.minute do
      @map.update_board!(phase: "offer")
    end
    assert_equal "offer", @map.reload.phase
    assert_not @map.on_hold?
    assert_in_delta Time.current + 1.minute, @map.phase_changed_at, 2
  end

  test "a phase change that also puts the project on hold keeps it on hold" do
    @map.update_board!(phase: "offer", on_hold: true)
    assert @map.reload.on_hold?
  end

  test "an unknown phase is refused" do
    assert_raises(ActiveRecord::RecordInvalid) { @map.update_board!(phase: "harvest") }
  end

  test "the lead is a member of the team and always works on the project" do
    @map.update_board!(lead_id: users(:bob).id, crew_ids: [ users(:michael).id ])
    assert_equal users(:bob), @map.reload.lead
    assert_equal [ users(:bob), users(:michael) ].sort_by(&:id), @map.crew.sort_by(&:id)
  end

  test "someone outside the team and the map cannot lead it or work on it" do
    stranger = make_user("Zoé")
    assert_raises(ActiveRecord::RecordInvalid) { @map.update_board!(lead_id: stranger.id) }
    @map.reload.update_board!(crew_ids: [ stranger.id, users(:bob).id ])
    assert_equal [ users(:bob) ], @map.reload.crew.to_a
  end

  test "closing keeps the reason and a note, reopening clears them" do
    @map.update_board!(closed_reason: "declined", closed_note: "  Budget   trop court ")
    assert @map.reload.closed?
    assert_equal [ "declined", "Budget trop court" ], [ @map.closed_reason, @map.closed_note ]
    @map.update_board!(reopen: true)
    assert_not @map.reload.closed?
    assert_nil @map.closed_reason
  end

  test "the promised date and what is promised" do
    @map.update_board!(promised_on: "2026-11-20", promised_what: "Le plan")
    assert_equal [ Date.new(2026, 11, 20), "Le plan" ], [ @map.reload.promised_on, @map.promised_what ]
    @map.update_board!(promised_on: "", promised_what: "")
    assert_nil @map.reload.promised_on
    assert_nil @map.promised_what
  end

  test "the next step is the first pending dated task" do
    list = @map.task_lists.create!(name: "Suivi")
    list.tasks.create!(title: "Sans date")
    later = list.tasks.create!(title: "Livrer le plan", due_on: Date.current + 10)
    sooner = list.tasks.create!(title: "Relevé", due_on: Date.current + 3)
    assert_equal sooner, @map.next_step_task
    sooner.update!(completed: true)
    assert_equal later, @map.next_step_task
  end

  test "a map becomes one of the team's own places and back, keeping its phase" do
    @map.update_board!(phase: "implementation")
    @map.update_board!(own_place: true)
    assert @map.reload.own_place
    @map.update_board!(own_place: "false")
    assert_equal [ false, "implementation" ], [ @map.reload.own_place, @map.phase ]
  end
end
