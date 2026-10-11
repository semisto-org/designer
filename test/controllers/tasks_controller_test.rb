require "test_helper"

class TasksControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @list = @map.task_lists.create!(name: "Chantier")
  end

  test "my tasks: the pending ones given to me, soonest first" do
    later = @list.tasks.create!(title: "Pailler", assignee: users(:alice), due_on: Date.new(2026, 12, 1))
    soon = @list.tasks.create!(title: "Commander", assignee: users(:alice), due_on: Date.new(2026, 11, 1))
    @list.tasks.create!(title: "Sans date", assignee: users(:alice))
    @list.tasks.create!(title: "Faite", assignee: users(:alice), completed: true)
    @list.tasks.create!(title: "À Michael", assignee: users(:michael))
    sign_in_as users(:alice)
    get my_tasks_path, headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal [ "Commander", "Pailler", "Sans date" ], props["tasks"].pluck("title")
    assert_equal({ "id" => @map.id, "name" => @map.name }, props["tasks"].first["map"])
    assert_equal "Chantier", props["tasks"].first["listName"]
    assert_equal({ "type" => "me" }, props["scope"])
    assert soon && later
  end

  test "a team's tasks: every pending task of the team's maps, for its members only" do
    team = Organization.create_with_admin!(users(:bob), name: "Bureau d'études")
    @map.update!(organization: team)
    @list.tasks.create!(title: "Relever l'existant")
    sign_in_as users(:bob)
    get my_tasks_path(team_id: team.id), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal({ "type" => "team", "id" => team.id, "name" => "Bureau d'études" }, props["scope"])
    assert_equal [ "Relever l'existant" ], props["tasks"].pluck("title")

    sign_in_as users(:alice)
    get my_tasks_path(team_id: team.id), headers: inertia_headers
    assert_equal({ "type" => "me" }, response.parsed_body["props"]["scope"])
  end
end
