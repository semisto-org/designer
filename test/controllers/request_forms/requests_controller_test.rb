require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

class RequestForms::RequestsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @team = make_team("Semisto", admin: users(:michael), members: [ users(:bob) ])
    @form = RequestForm.create!(owner: @team)
    @project_request = @form.project_requests.create!(name: "Marie Dupont", email: "marie@example.org", phone: "0470 12 34 56",
      center: GeoJsonGeometry::FACTORY.point(4.9055, 50.3405), region: regions(:wallonia), answers: { "budget" => "up_to_2000" })
  end

  test "a member reads the request, moves it along and keeps notes" do
    sign_in_as users(:bob)
    get request_form_request_path(@form, @project_request), headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal "request_forms/requests/show", response.parsed_body["component"]
    assert_equal [ "Marie Dupont", [ 4.9055, 50.3405 ] ], props["request"].values_at("name", "center")

    patch request_form_request_path(@form, @project_request), params: { request: { status: "called", team_notes: "Visite le 20" } }, as: :json
    assert_response :success
    assert_equal [ "called", "Visite le 20" ], @project_request.reload.values_at(:status, :team_notes)
  end

  test "« Créer la carte » moves the request on and opens the new map's offer" do
    sign_in_as users(:bob)
    assert_difference -> { Map.count } do
      post map_request_form_request_path(@form, @project_request)
    end
    map = @project_request.reload.map
    assert_redirected_to map_offer_path(map)
    assert_equal "visited", @project_request.status
    assert_equal [ users(:bob), @team ], [ map.owner, map.organization ]
    assert_equal "up_to_2000", map.project_sheet.section("budget")["initial"]
  end

  test "outside the team: not found" do
    sign_in_as users(:alice)
    get request_form_request_path(@form, @project_request), headers: inertia_headers
    assert_response :not_found
  end
end
