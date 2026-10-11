require "test_helper"
require_relative "../support/map_data_test_helper"
require_relative "../test_helpers/teams_test_helper"

# The public request form: no account, its own map endpoints, a honeypot.
class PublicRequestFormsControllerTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper
  include ActionMailer::TestHelper

  setup do
    seed_wallonia_layers
    @team = make_team("Semisto", admin: users(:michael))
    @form = RequestForm.create!(owner: @team, intro: "Bienvenue !")
  end

  test "the form opens without an account, and is not indexed" do
    get public_request_form_path(@form.slug), headers: inertia_headers
    assert_response :success
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]
    body = response.parsed_body
    assert_equal "public_request_forms/show", body["component"]
    assert_equal [ "Semisto", "Bienvenue !" ], body["props"].values_at("account", "intro")
    assert_equal %w[profile services budget water access slope source], body["props"]["schema"]["fields"].map { _1["key"] }
  end

  test "a closed form is gone" do
    @form.update!(active: false)
    get public_request_form_path(@form.slug), headers: inertia_headers
    assert_response :not_found
    assert_equal "public_request_forms/gone", response.parsed_body["component"]
    get public_request_form_path("nobody-here"), headers: inertia_headers
    assert_response :not_found

    personal = RequestForm.create!(owner: users(:alice))
    get public_request_form_path(personal.slug), headers: inertia_headers
    assert_response :not_found, "a personal account receives no requests"
    users(:alice).update!(account_kind: "professional")
    get public_request_form_path(personal.slug), headers: inertia_headers
    assert_response :success
  end

  test "the place: its region with the cadastre, and the parcel under a tap" do
    get public_request_form_locate_path(@form.slug), params: { lng: 4.9055, lat: 50.3405 }, as: :json
    assert_response :success
    assert_equal "wallonia", response.parsed_body["region"]["key"]
    assert_equal "cadastre", response.parsed_body["cadastre"]
    assert response.parsed_body["parcels"]

    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    get public_request_form_parcel_path(@form.slug), params: { lng: 4.9055, lat: 50.3405 }, as: :json
    assert_response :success
    assert_equal "92142B0247/00X009", response.parsed_body["parcel"]["capakey"]

    get public_request_form_parcel_path(@form.slug), params: { lng: "x", lat: 50 }, as: :json
    assert_response :unprocessable_entity
  end

  test "sending creates the request and tells the team" do
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    payload = { name: "Marie", email: "marie@example.org", answers: { services: %w[design] },
                parcels: [ { capakey: "92142B0247/00X009", lng: 4.9055, lat: 50.3405 } ] }
    assert_difference -> { @form.project_requests.count } do
      assert_enqueued_emails 2 do
        post public_request_form_path(@form.slug), params: { payload: payload.to_json, photos: [ fixture_file_upload("terrain.jpg", "image/jpeg") ] }
      end
    end
    assert_response :created
    request = @form.project_requests.last
    assert_equal [ %w[design], 1 ], [ request.answers["services"], request.photos.count ]
    assert request.boundary
  end

  test "bad answers are refused; a robot filling the hidden field is thanked and forgotten" do
    post public_request_form_path(@form.slug), params: { payload: { name: "Marie", email: "marie@example.org", answers: { budget: "lots" } }.to_json }
    assert_response :unprocessable_entity
    assert response.parsed_body["errors"]["answers"]

    post public_request_form_path(@form.slug), params: { payload: "{not json" }
    assert_response :unprocessable_entity

    assert_no_difference -> { ProjectRequest.count } do
      post public_request_form_path(@form.slug), params: { payload: { name: "Bot", email: "bot@example.org" }.to_json, website: "http://spam" }
    end
    assert_response :success
  end
end
