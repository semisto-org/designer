require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

# The team board (« Tableau de l'équipe ») and its four entry points.
class Teams::BoardControllersTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  setup do
    @team = make_team("Design Labs", admin: users(:michael), members: [ users(:bob) ])
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
    @form = RequestForm.create!(owner: @team)
    @project_request = @form.project_requests.create!(name: "Marie Dupont", email: "marie@example.org",
      center: GeoJsonGeometry::FACTORY.point(4.9055, 50.3405), region: regions(:wallonia))
  end

  test "a member of the team opens the board" do
    sign_in_as users(:bob)
    get team_board_path(@team), headers: inertia_headers
    assert_response :success
    assert_equal "teams/board", response.parsed_body["component"]
    props = response.parsed_body["props"]
    assert_equal [ @map.id ], props["projects"].map { _1["id"] }
    assert_equal [ "Marie Dupont" ], props["requests"].map { _1["name"] }
    assert_equal %w[request offer design implementation co_management completed], props["phases"]
  end

  test "outside the team: not found" do
    sign_in_as users(:alice)
    get team_board_path(@team), headers: inertia_headers
    assert_response :not_found
    patch team_board_project_path(@team, @map), params: { project: { phase: "offer" } }, as: :json
    assert_response :not_found
  end

  test "dropping a project in another column with its next step" do
    sign_in_as users(:michael)
    assert_enqueued_emails 1 do
      patch team_board_project_path(@team, @map), as: :json,
        params: { project: { phase: "offer" }, next_step: { title: "Envoyer l'offre", assignee_id: users(:bob).id, due_on: "2026-10-20" } }
    end
    assert_response :success
    project = response.parsed_body["project"]
    assert_equal [ "offer", "Envoyer l'offre", "2026-10-20" ], [ project["phase"], project.dig("nextStep", "title"), project.dig("nextStep", "dueOn") ]
    task = @map.tasks.find_by!(title: "Envoyer l'offre")
    assert_equal [ users(:bob), "follow_up" ], [ task.assignee, task.task_list.key ]
  end

  test "the project's settings: lead, crew, promise, hold, close and reopen" do
    sign_in_as users(:bob)
    patch team_board_project_path(@team, @map), as: :json,
      params: { project: { lead_id: users(:bob).id, crew_ids: [ users(:michael).id ], promised_on: "2026-12-01", promised_what: "Le plan", on_hold: true } }
    assert_response :success
    @map.reload
    assert_equal [ users(:bob), Date.new(2026, 12, 1), "Le plan" ], [ @map.lead, @map.promised_on, @map.promised_what ]
    assert @map.on_hold?
    assert_equal [ users(:bob), users(:michael) ].map(&:id).sort, @map.crew_ids.sort

    patch team_board_project_path(@team, @map), params: { project: { closed_reason: "no_reply", closed_note: "Trois relances" } }, as: :json
    assert @map.reload.closed?
    patch team_board_project_path(@team, @map), params: { project: { reopen: true } }, as: :json
    assert_not @map.reload.closed?
  end

  test "a wrong change answers with the reason" do
    sign_in_as users(:bob)
    patch team_board_project_path(@team, @map), params: { project: { phase: "harvest" } }, as: :json
    assert_response :unprocessable_entity
    assert response.parsed_body["message"].present?
  end

  test "the map editor reads the project with the team's people" do
    sign_in_as users(:bob)
    get team_board_project_path(@team, @map), as: :json
    assert_response :success
    assert_equal @map.id, response.parsed_body.dig("project", "id")
    assert_equal [ users(:bob), users(:michael) ].map(&:id).sort, response.parsed_body["members"].map { _1["id"] }.sort
  end

  test "season steps are drawn, moved, stretched and removed" do
    sign_in_as users(:bob)
    post team_board_steps_path(@team), as: :json,
      params: { step: { map_id: @map.id, step_kind: "plant", title: "", starts_on: "2026-12-01", due_on: "2026-12-14" } }
    assert_response :created
    step = response.parsed_body["step"]
    assert_equal [ "plant", "Plantation", "2026-12-01" ], step.values_at("kind", "title", "startsOn")
    task = Task.find(step["id"])
    assert_equal "season", task.task_list.key

    patch team_board_step_path(@team, task), params: { step: { starts_on: "2026-12-08", due_on: "2026-12-28" } }, as: :json
    assert_response :success
    assert_equal [ Date.new(2026, 12, 8), Date.new(2026, 12, 28) ], task.reload.values_at(:starts_on, :due_on)

    patch team_board_step_path(@team, task), params: { step: { starts_on: "2027-01-08" } }, as: :json
    assert_response :unprocessable_entity

    delete team_board_step_path(@team, task), as: :json
    assert_response :no_content
    assert_not Task.exists?(task.id)
  end

  test "a request is followed, declined with a note, or qualified into a team map" do
    sign_in_as users(:bob)
    patch team_board_request_path(@team, @project_request), params: { request: { status: "called" } }, as: :json
    assert_response :no_content
    assert_equal "called", @project_request.reload.status

    assert_difference -> { Map.count } do
      post qualify_team_board_request_path(@team, @project_request), params: { lead_id: users(:michael).id }
    end
    assert_redirected_to team_board_path(@team)
    map = @project_request.reload.map
    assert_equal [ @team, "request", users(:michael) ], [ map.organization, map.phase, map.lead ]

    other = @form.project_requests.create!(name: "Paul", email: "paul@example.org")
    patch team_board_request_path(@team, other), params: { request: { status: "declined", decline_note: "Trop loin" } }, as: :json
    assert_equal [ "declined", "Trop loin" ], other.reload.values_at(:status, :decline_note)
  end
end
