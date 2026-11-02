require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

class Maps::ProjectNotesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @owner.update!(account_kind: "professional")
  end

  def write(section, body, lock_version: nil)
    patch map_project_note_path(@map, section), params: { body:, lock_version: }, as: :json
  end

  test "the pro owner writes a section's note and finds it on the sheet" do
    sign_in_as @owner
    write "who", "**Visite** du 2 novembre : le voisin veut une haie"
    assert_response :success
    note = response.parsed_body["note"]
    assert_equal [ "**Visite** du 2 novembre : le voisin veut une haie", 0 ], note.values_at("body", "lockVersion")

    get map_project_path(@map), as: :json
    team_notes = response.parsed_body["teamNotes"]
    assert_equal true, team_notes["canEdit"]
    assert_nil team_notes["teamName"]
    assert_equal note["body"], team_notes.dig("notes", "who", "body")

    write "who", "", lock_version: note["lockVersion"]
    assert_response :success
    assert_nil response.parsed_body["note"]
    assert_empty @map.project_sheet_notes.reload
  end

  test "a stale version answers 409 with the note as it now stands" do
    ProjectSheetNote.write!(@map, "budget", "Écrit par un collègue", user: @owner, lock_version: nil)
    sign_in_as @owner
    write "budget", "Ma version"
    assert_response :conflict
    assert_equal "Écrit par un collègue", response.parsed_body.dig("note", "body")
    assert_equal "Écrit par un collègue", @map.project_sheet_notes.sole.body
  end

  test "people invited on the map never see or write the notes, not even their existence" do
    ProjectSheetNote.write!(@map, "who", "Interne", user: @owner, lock_version: nil)
    client = users(:alice)
    @map.memberships.find_by(user: client).update!(role: "editor")
    sign_in_as client
    get map_project_path(@map), as: :json
    assert_response :success
    assert_nil response.parsed_body["teamNotes"]
    assert_not_includes response.body, "Interne"
    write "who", "Je lis tout"
    assert_response :not_found
    assert_equal "Interne", @map.project_sheet_notes.sole.reload.body
  end

  test "an owner without a pro account has no notes" do
    @owner.update!(account_kind: "individual")
    sign_in_as @owner
    get map_project_path(@map), as: :json
    assert_nil response.parsed_body["teamNotes"]
    write "who", "x"
    assert_response :not_found
  end

  test "team members share the notes of the team's maps" do
    designer = make_user("Léa")
    @map.update!(organization: make_team("Semisto", admin: @owner, members: [ designer ]))
    sign_in_as designer
    write "constraints", "Sol à sonder au nord"
    assert_response :success
    assert_equal designer, @map.project_sheet_notes.sole.updated_by
    get map_project_path(@map), as: :json
    assert_equal "Semisto", response.parsed_body.dig("teamNotes", "teamName")
  end

  test "an unknown section is refused" do
    sign_in_as @owner
    write "secrets", "x"
    assert_response :not_found
  end

  test "the private link of the sheet never carries the notes" do
    ProjectSheetNote.write!(@map, "who", "Interne", user: @owner, lock_version: nil)
    link = @map.create_project_sheet_link!(created_by: @owner)
    get project_form_path(link.token), headers: inertia_headers
    assert_response :success
    assert_not_includes response.body, "Interne"
    assert_not_includes response.body, "teamNotes"
  end
end
