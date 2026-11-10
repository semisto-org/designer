require "test_helper"

class Maps::SeasonStepsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @map.update_column(:tasks_seeded_at, Time.current)
  end

  test "an editor draws, moves, confirms and removes a step of the map's frieze" do
    sign_in_as users(:michael)
    post map_season_steps_path(@map), as: :json,
      params: { step: { step_kind: "plant", title: "", starts_on: "2026-12-01", due_on: "2026-12-14", forecast: true } }
    assert_response :created
    step = response.parsed_body["step"]
    assert_equal [ "plant", "Plantation", "2026-12-01", true ], step.values_at("kind", "title", "startsOn", "forecast")
    task = Task.find(step["id"])
    assert_equal TaskList::SEASON_KEY, task.task_list.key
    # The answer carries the whole board: the step is a task of its season list.
    assert_includes response.parsed_body.dig("board", "tasks").pluck("id"), task.id

    patch map_season_step_path(@map, task), params: { step: { starts_on: "2026-12-08", due_on: "2026-12-28", forecast: false } }, as: :json
    assert_response :success
    assert_equal [ Date.new(2026, 12, 8), Date.new(2026, 12, 28), false ], task.reload.values_at(:starts_on, :due_on, :forecast)

    patch map_season_step_path(@map, task), params: { step: { starts_on: "2027-01-08" } }, as: :json
    assert_response :unprocessable_entity

    delete map_season_step_path(@map, task), as: :json
    assert_response :success
    refute Task.exists?(task.id)
  end

  test "a viewer reads the frieze but cannot change it" do
    sign_in_as users(:alice)
    post map_season_steps_path(@map), as: :json,
      params: { step: { step_kind: "design", starts_on: "2026-12-01", due_on: "2026-12-14" } }
    assert_response :forbidden
  end

  test "only season steps of this map are reached" do
    list = @map.task_lists.create!(name: "Chantier")
    plain = list.tasks.create!(map: @map, title: "Commander le broyat")
    sign_in_as users(:michael)
    patch map_season_step_path(@map, plain), params: { step: { starts_on: "2026-12-01" } }, as: :json
    assert_response :not_found
  end

  test "the tasks page brings the frieze: steps, planting window and kinds" do
    step = SeasonSteps.create!(@map, { step_kind: "design", starts_on: Date.current, due_on: Date.current + 14 }, by: users(:michael))
    sign_in_as users(:michael)
    get map_tasks_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal Task::STEP_KINDS, props["stepKinds"]
    assert props.dig("season", "opensOn")
    found = props["tasks"].find { _1["id"] == step.id }
    assert_equal [ "design", Date.current.iso8601 ], found.values_at("stepKind", "startsOn")
  end
end
