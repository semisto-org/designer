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
end
