require "test_helper"

class Maps::ProjectDraftsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @map.update!(project: { "budget" => { "initial" => "under_500", "notes" => "Garder" } })
    @goals = draft("ambitions", "goals", %w[food_autonomy])
    @budget = draft("budget", "initial", "up_to_2000")
  end

  test "the sheet lists the answers an AI proposed" do
    sign_in_as users(:michael)
    get map_project_path(@map), as: :json
    drafts = response.parsed_body["drafts"]
    assert_equal [ [ "ambitions", "goals", [ "food_autonomy" ] ], [ "budget", "initial", "up_to_2000" ] ], drafts.map { |d| d.values_at("section", "field", "value") }
    assert_equal "Claude", drafts.first["clientName"]
  end

  test "accepting one answer merges it into the sheet, field by field" do
    sign_in_as users(:michael)
    post accept_map_project_draft_path(@map, @budget), as: :json
    assert_response :success
    body = response.parsed_body
    assert_equal({ "initial" => "up_to_2000", "notes" => "Garder" }, body["project"]["budget"])
    assert_equal [ @goals.id ], body["drafts"].map { |d| d["id"] }
    assert_equal "up_to_2000", @map.reload.project.dig("budget", "initial")
    assert @map.project.dig("meta", "touched", "budget"), "an accepted answer counts as an edit of its section"
  end

  test "all answers at once, accepted or refused" do
    sign_in_as users(:michael)
    post accept_map_project_draft_path(@map, "all"), as: :json
    assert_equal %w[food_autonomy], @map.reload.project.dig("ambitions", "goals")
    assert_empty @map.project_sheet_drafts

    draft("time", "hours_per_week", 3)
    post reject_map_project_draft_path(@map, "all"), as: :json
    assert_response :success
    assert_empty response.parsed_body["drafts"]
    assert_nil @map.reload.project["time"], "a refused answer never reaches the sheet"
  end

  test "viewers and strangers cannot review" do
    sign_in_as users(:alice)
    post accept_map_project_draft_path(@map, @budget), as: :json
    assert_response :forbidden
    sign_in_as users(:bob)
    post reject_map_project_draft_path(@map, @budget), as: :json
    assert_response :not_found
    assert_equal 2, @map.project_sheet_drafts.count
  end

  private
    def draft(section, field, value)
      @map.project_sheet_drafts.create!(section:, field:, value:, rationale: "Dit pendant l'entretien.", created_by: users(:michael), client_name: "Claude")
    end
end
