require "test_helper"
require_relative "../../test_helpers/teams_test_helper"
require_relative "../../test_helpers/forms_test_helper"

# The team's « Formulaires » page, its answers, and the link sent from a map.
class Teams::FormsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @team = make_team("Design Labs", admin: users(:michael), members: [ users(:bob) ])
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
  end

  test "an admin connects Tally and adds a form by its link" do
    sign_in_as users(:michael)
    post connect_team_forms_path(@team)
    assert_redirected_to team_forms_path(@team)
    post team_forms_path(@team), params: { form: { link: "https://tally.so/r/w77j70", name: "Retour en fin de projet" } }
    assert_equal [ [ "w77j70", "Retour en fin de projet" ] ], @team.form_inbox.forms.pluck(:external_id, :name)

    get team_forms_path(@team), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal "teams/forms", response.parsed_body["component"]
    assert_match %r{/webhooks/tally/#{@team.form_inbox.token}\z}, props.dig("inbox", "url")
    assert_equal @team.form_inbox.signing_secret, props.dig("inbox", "secret")
    assert_equal [ "Retour en fin de projet" ], props["forms"].map { _1["name"] }
  end

  test "a bad link is refused" do
    sign_in_as users(:michael)
    post team_forms_path(@team), params: { form: { link: "https://example.org/form" } }
    assert_redirected_to team_forms_path(@team)
    assert_nil @team.reload.form_inbox&.forms&.first
  end

  test "a member reads the page without the secret, and files an answer" do
    inbox = FormInbox.for(@team)
    answer = Forms::Receive.new(inbox, tally_event).call
    sign_in_as users(:bob)
    get team_forms_path(@team), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal({ "connected" => true }, props["inbox"])
    assert_equal [ [ answer.id, nil ] ], props["responses"].map { [ _1["id"], _1["mapId"] ] }

    post connect_team_forms_path(@team)
    assert_redirected_to team_path(@team)
    delete team_form_response_path(@team, answer)
    assert FormResponse.exists?(answer.id)

    patch team_form_response_path(@team, answer), params: { response: { map_id: @map.id } }
    assert_redirected_to team_forms_path(@team)
    assert_equal @map, answer.reload.map
    assert_equal 1, @map.documents.where(origin: "form").count
  end

  test "an answer goes only to a map of the team" do
    answer = Forms::Receive.new(FormInbox.for(@team), tally_event).call
    other = Map.create!(name: "Ailleurs", owner: users(:michael), region: regions(:wallonia))
    sign_in_as users(:michael)
    patch team_form_response_path(@team, answer), params: { response: { map_id: other.id } }
    assert_nil answer.reload.map
  end

  test "outside the team: not found" do
    sign_in_as users(:alice)
    get team_forms_path(@team), headers: inertia_headers
    assert_response :not_found
  end

  test "the map's documents offer the team's forms, with the link for this map" do
    FormInbox.for(@team).forms.create!(external_id: "w77j70", name: "Retour en fin de projet")
    sign_in_as users(:bob)
    get map_documents_path(@map), headers: inertia_headers
    assert_equal [ "https://tally.so/r/w77j70?carte=#{@map.id}" ], response.parsed_body.dig("props", "forms").map { _1["link"] }
  end
end
