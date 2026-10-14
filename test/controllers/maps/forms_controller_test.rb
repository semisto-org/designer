require "test_helper"
require_relative "../../test_helpers/teams_test_helper"
require_relative "../../test_helpers/forms_test_helper"

# A team map's « Formulaires »: the links to send, the answers received.
class Maps::FormsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @team = make_team("Design Labs", admin: users(:michael), members: [ users(:bob) ])
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
  end

  test "an editor gets the team's forms with the link for this map, and the map's answers" do
    inbox = FormInbox.for(@team)
    inbox.forms.create!(external_id: "w77j70", name: "Retour en fin de projet")
    answer = Forms::Receive.new(inbox, tally_event(map: @map)).call
    Forms::Receive.new(inbox, tally_event(response_id: "rsp2")).call # unfiled: not this map's

    sign_in_as users(:bob)
    get map_forms_path(@map), headers: inertia_headers
    assert_response :success
    body = response.parsed_body
    assert_equal "maps/forms/index", body["component"]
    props = body["props"]
    assert_equal @team.id, props.dig("map", "teamId")
    assert_equal({ "id" => @team.id, "name" => "Design Labs", "admin" => false }, props["team"])
    assert props["connected"]
    form = props["forms"].sole
    assert_equal "https://tally.so/r/w77j70?carte=#{@map.id}", form["link"]
    assert_equal 1, form["responsesCount"]
    listed = props["responses"].sole
    assert_equal answer.id, listed["id"]
    assert_equal answer.reload.map_document_id, listed["documentId"]
    assert_includes listed["fields"].map { _1["value"] }, "La visite du terrain"
  end

  test "a viewer reads the answers but gets no link to send" do
    inbox = FormInbox.for(@team)
    inbox.forms.create!(external_id: "w77j70", name: "Retour en fin de projet")
    Forms::Receive.new(inbox, tally_event(map: @map)).call
    sign_in_as users(:alice)
    get map_forms_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal false, props["canEdit"]
    assert_empty props["forms"]
    assert_equal 1, props["responses"].size
  end

  test "before Tally is connected, the page says so" do
    sign_in_as users(:michael)
    get map_forms_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal false, props["connected"]
    assert props.dig("team", "admin")
    assert_empty props["forms"]
  end

  test "a map outside any team has no team, and someone outside the map gets nothing" do
    @map.update!(organization: nil)
    sign_in_as users(:michael)
    get map_forms_path(@map), headers: inertia_headers
    assert_nil response.parsed_body.dig("props", "team")
    assert_nil response.parsed_body.dig("props", "map", "teamId")

    sign_in_as users(:bob) # in the team, but the map left it
    get map_forms_path(@map), headers: inertia_headers
    assert_response :not_found
  end
end
