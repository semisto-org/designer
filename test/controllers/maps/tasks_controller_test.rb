require "test_helper"

class Maps::TasksControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @list = @map.task_lists.create!(name: "Chantier")
    @map.update_column(:tasks_seeded_at, Time.current)
  end

  test "the first visit adds Semisto's default lists" do
    @map.task_lists.destroy_all
    @map.update_column(:tasks_seeded_at, nil)
    sign_in_as users(:alice)
    get map_tasks_path(@map), headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal "maps/tasks/index", response.parsed_body["component"]
    assert_equal [ "Observer le lieu", "Cartographier l'existant", "Concevoir", "Planter" ], props["lists"].pluck("name")
    assert_equal 18, props["tasks"].size
    assert_equal false, props["canEdit"]
    assert_equal [ "Alice", "Michael" ].sort, props["participants"].pluck("name").sort
    # The fixture map has its outline drawn: the journey says so.
    assert_equal true, props["tasks"].find { |t| t["key"] == "boundary" }["mapSaysDone"]
  end

  test "outsiders see nothing" do
    sign_in_as users(:bob)
    get map_tasks_path(@map), as: :json
    assert_response :not_found
  end

  test "an editor adds a task and the assignee is e-mailed" do
    sign_in_as users(:michael)
    assert_enqueued_emails 1 do
      post map_tasks_path(@map), params: { task: { task_list_id: @list.id, title: "Commander le broyat", assignee_id: users(:alice).id, due_on: "2026-11-15", tags: [ "Phase 1" ] } }, as: :json
    end
    assert_response :created
    task = response.parsed_body["task"]
    assert_equal "Commander le broyat", task["title"]
    assert_equal "2026-11-15", task["dueOn"]
    assert_equal({ "id" => users(:alice).id, "name" => users(:alice).display_name }, task["assignee"])
    assert_equal [ "Phase 1" ], task["tags"]
    assert_equal [ "Commander le broyat" ], response.parsed_body.dig("board", "tasks").pluck("title")
  end

  test "an editor gives a task to someone invited, who is e-mailed their invitation" do
    @map.invitations.create!(email_address: "dana@example.org", role: "editor", invited_by: users(:michael))
    sign_in_as users(:michael)
    get map_tasks_path(@map), headers: inertia_headers
    assert_includes response.parsed_body.dig("props", "participants"), { "email" => "dana@example.org", "name" => "dana@example.org", "role" => "invited" }

    assert_enqueued_emails 1 do
      post map_tasks_path(@map), params: { task: { task_list_id: @list.id, title: "Relever les arbres", invitee_email: "dana@example.org" } }, as: :json
    end
    assert_response :created
    assert_equal({ "email" => "dana@example.org", "name" => "dana@example.org", "invited" => true }, response.parsed_body.dig("task", "assignee"))

    task = Task.find(response.parsed_body.dig("task", "id"))
    patch map_task_path(@map, task), params: { task: { assignee_id: nil, invitee_email: nil } }, as: :json
    assert_response :success
    assert_not task.reload.assigned?
  end

  test "giving a task to myself sends nothing" do
    sign_in_as users(:michael)
    assert_no_enqueued_emails do
      post map_tasks_path(@map), params: { task: { task_list_id: @list.id, title: "Tailler", assignee_id: users(:michael).id } }, as: :json
    end
  end

  test "a task cannot go to someone outside the map" do
    sign_in_as users(:michael)
    post map_tasks_path(@map), params: { task: { task_list_id: @list.id, title: "Tailler", assignee_id: users(:bob).id } }, as: :json
    assert_response :unprocessable_entity
    assert_match "doit participer à la carte", response.parsed_body["message"]
  end

  test "viewers cannot add tasks" do
    sign_in_as users(:alice)
    post map_tasks_path(@map), params: { task: { task_list_id: @list.id, title: "Tailler" } }, as: :json
    assert_response :forbidden
  end

  test "ticking remembers who did it" do
    task = @list.tasks.create!(title: "Pailler")
    sign_in_as users(:michael)
    patch map_task_path(@map, task), params: { task: { completed: true } }, as: :json
    assert_response :success
    assert task.reload.done?
    assert_equal users(:michael), task.completed_by
    assert_equal users(:michael).display_name, response.parsed_body.dig("task", "completedBy")
  end

  test "a viewer ticks the task given to them, and nothing else" do
    task = @list.tasks.create!(title: "Arroser", assignee: users(:alice))
    sign_in_as users(:alice)
    patch map_task_path(@map, task), params: { task: { completed: true } }, as: :json
    assert_response :success
    assert task.reload.done?

    patch map_task_path(@map, task), params: { task: { title: "Autre chose" } }, as: :json
    assert_response :forbidden
    other = @list.tasks.create!(title: "Tailler")
    patch map_task_path(@map, other), params: { task: { completed: true } }, as: :json
    assert_response :forbidden
  end

  test "reassigning e-mails the new assignee" do
    task = @list.tasks.create!(title: "Arroser")
    sign_in_as users(:michael)
    assert_enqueued_emails 1 do
      patch map_task_path(@map, task), params: { task: { assignee_id: users(:alice).id } }, as: :json
    end
    assert_no_enqueued_emails do
      patch map_task_path(@map, task), params: { task: { title: "Arroser les jeunes plants" } }, as: :json
    end
  end

  test "a task moves to another list" do
    task = @list.tasks.create!(title: "Arroser")
    other = @map.task_lists.create!(name: "Été")
    other.tasks.create!(title: "Pailler")
    sign_in_as users(:michael)
    patch map_task_path(@map, task), params: { task: { task_list_id: other.id, position: 0 } }, as: :json
    assert_response :success
    assert_equal %w[Arroser Pailler], other.tasks.reload.map(&:title)
  end

  test "an editor deletes a task" do
    task = @list.tasks.create!(title: "Arroser")
    sign_in_as users(:michael)
    delete map_task_path(@map, task), as: :json
    assert_response :success
    assert_not Task.exists?(task.id)
  end

  test "a task about plants: created from a plant's sheet, listed on it, unlinked from the task page" do
    plant = @map.features.create!(layer: "plants", kind: "plant", name: "Pommier", geometry: point, properties: { "number" => 7 })
    other = @map.features.create!(layer: "plants", kind: "plant", name: "Poirier", geometry: point, properties: { "number" => 8 })
    sign_in_as users(:michael)
    post map_tasks_path(@map), params: { task: { task_list_id: @list.id, title: "Recouper les gourmands", feature_ids: [ plant.id, other.id ] } }, as: :json
    assert_response :created
    task = response.parsed_body["task"]
    assert_equal [ "n° 7 — Pommier", "n° 8 — Poirier" ], task["features"].pluck("label")
    assert_equal task["features"], response.parsed_body["board"]["tasks"].find { _1["id"] == task["id"] }["features"]

    sign_in_as users(:alice)
    get map_tasks_path(@map, feature_id: plant.id, format: :json)
    assert_equal [ "Recouper les gourmands" ], response.parsed_body["tasks"].pluck("title")
    assert_includes response.parsed_body["lists"].pluck("name"), "Chantier"

    sign_in_as users(:michael)
    patch map_task_path(@map, task["id"]), params: { task: { feature_ids: [ other.id ] } }, as: :json
    assert_response :success
    get map_tasks_path(@map, feature_id: plant.id, format: :json)
    assert_empty response.parsed_body["tasks"]
  end
end
