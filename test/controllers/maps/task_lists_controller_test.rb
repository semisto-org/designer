require "test_helper"

class Maps::TaskListsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @map.update_column(:tasks_seeded_at, Time.current)
  end

  test "an editor creates, renames, moves and deletes a list" do
    sign_in_as users(:michael)
    post map_task_lists_path(@map), params: { task_list: { name: "Devis" } }, as: :json
    assert_response :created
    devis = @map.task_lists.find(response.parsed_body.dig("list", "id"))
    post map_task_lists_path(@map), params: { task_list: { name: "Chantier" } }, as: :json

    patch map_task_list_path(@map, devis), params: { task_list: { name: "Devis et commandes", position: 1 } }, as: :json
    assert_response :success
    assert_equal [ "Chantier", "Devis et commandes" ], response.parsed_body.dig("board", "lists").pluck("name")

    delete map_task_list_path(@map, devis), as: :json
    assert_response :success
    assert_equal [ "Chantier" ], @map.task_lists.reload.map(&:name)
  end

  test "a blank name is refused" do
    sign_in_as users(:michael)
    post map_task_lists_path(@map), params: { task_list: { name: "" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "viewers cannot manage lists" do
    sign_in_as users(:alice)
    post map_task_lists_path(@map), params: { task_list: { name: "Devis" } }, as: :json
    assert_response :forbidden
  end

  test "Semisto's lists can be put back" do
    sign_in_as users(:michael)
    post defaults_map_task_lists_path(@map), as: :json
    assert_response :success
    assert_equal 4, response.parsed_body.dig("board", "lists").size
    post defaults_map_task_lists_path(@map), as: :json
    assert_equal 4, @map.task_lists.count
  end
end
