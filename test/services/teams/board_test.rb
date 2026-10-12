require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

class Teams::BoardTest < ActiveSupport::TestCase
  TODAY = Date.new(2026, 10, 12)

  setup do
    @team = make_team("Design Labs", admin: users(:michael), members: [ users(:bob) ])
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
    @form = RequestForm.create!(owner: @team)
  end

  def board(today = TODAY) = Teams::Board.new(@team, users(:michael), today:).as_json

  test "a team map is a project in design, with its lead, crew and next step" do
    @map.update_board!(lead_id: users(:bob).id, crew_ids: [ users(:michael).id ], promised_on: "2026-11-20", promised_what: "Le plan")
    list = @map.task_lists.create!(name: "Suivi")
    list.tasks.create!(title: "Relevé de terrain", due_on: TODAY + 3, assignee: users(:bob))
    list.tasks.create!(title: "Commander", due_on: TODAY - 2)

    project = board[:projects].sole
    assert_equal [ @map.id, "design", "Le plan", "2026-11-20" ], project.values_at(:id, :phase, :promisedWhat, :promisedOn)
    assert_equal users(:bob).id, project[:lead][:id]
    assert_equal [ users(:michael).id ], project[:crew].map { _1[:id] }
    assert_equal "Commander", project[:nextStep][:title]
    assert_equal 1, project[:overdueTasks]
  end

  test "open requests come first, the oldest at the top, and the late ones are counted" do
    old = travel_to(TODAY - 9) { @form.project_requests.create!(name: "Ancienne", email: "a@example.org") }
    @form.project_requests.create!(name: "Récente", email: "r@example.org", created_at: TODAY.to_time)
    @form.project_requests.create!(name: "Refusée", email: "x@example.org", status: "declined")
    data = board
    assert_equal [ "Ancienne", "Récente" ], data[:requests].map { _1[:name] }
    assert_equal 1, data[:figures][:unanswered]
    old.update!(status: "called")
    assert_equal 0, board[:figures][:unanswered]
  end

  test "the season: its window, its steps and the plantings that are ready" do
    list = @map.task_lists.create!(name: "Saison")
    list.tasks.create!(title: "Plantation", step_kind: "plant", starts_on: Date.new(2026, 12, 1), due_on: Date.new(2027, 1, 15))
    list.tasks.create!(title: "Trop tard", step_kind: "site", starts_on: Date.new(2028, 1, 1), due_on: Date.new(2028, 1, 8))
    data = board
    assert_equal({ opensOn: "2026-11-01", closesOn: "2027-03-31", inSeason: false, weeks: 3 }, data[:season])
    assert_equal [ "Plantation" ], data[:steps].map { _1[:title] }
    assert_equal({ unanswered: 0, plantingsPlanned: 1, plantingsReady: 0 }, data[:figures])
    @map.update_board!(phase: "implementation")
    assert_equal 1, board[:figures][:plantingsReady]
    assert board(Date.new(2027, 2, 1))[:season][:inSeason]
  end

  test "who carries what" do
    @map.update_board!(lead_id: users(:bob).id)
    list = @map.task_lists.create!(name: "Suivi")
    list.tasks.create!(title: "Relancer", due_on: TODAY - 1, assignee: users(:bob))
    list.tasks.create!(title: "Plus tard", due_on: TODAY + 60, assignee: users(:bob))
    bob = board[:people].find { _1[:id] == users(:bob).id }
    assert_equal [ [ @map.id ], 1, 1 ], bob.values_at(:leads, :tasksSoon, :overdue)
  end

  test "closed and completed projects do not weigh on anyone" do
    @map.update_board!(lead_id: users(:bob).id, phase: "completed")
    assert_empty board[:people].find { _1[:id] == users(:bob).id }[:leads]
  end
end
