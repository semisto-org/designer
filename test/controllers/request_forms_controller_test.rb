require "test_helper"
require_relative "../test_helpers/teams_test_helper"

# « Demandes »: each account's form and its requests; admins open and change it.
class RequestFormsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = users(:michael)
    @member = users(:bob)
    @team = make_team("Semisto", admin: @admin, members: [ @member ])
  end

  test "an admin opens the team's form; members read its requests" do
    sign_in_as @admin
    assert_difference -> { RequestForm.count } do
      post request_forms_path, params: { account: "team-#{@team.id}" }
    end
    assert_redirected_to request_forms_path
    form = RequestForm.find_by!(owner: @team)
    form.project_requests.create!(name: "Marie", email: "marie@example.org")

    sign_in_as @member
    get request_forms_path, headers: inertia_headers
    accounts = response.parsed_body["props"]["accounts"]
    team = accounts.find { _1["key"] == "team-#{@team.id}" }
    assert_not team["canEdit"]
    assert_equal "http://www.example.com/demande/semisto", team["form"]["url"]
    assert_equal [ "Marie" ], team["requests"].map { _1["name"] }
    assert_equal 1, @member.as_inertia[:newRequests]

    post request_forms_path, params: { account: "team-#{@team.id}" }
    assert_redirected_to request_forms_path
    assert_equal I18n.t("request_forms.admins_only"), flash[:alert]
    patch request_form_path(form), params: { form: { active: false } }, as: :json
    assert_response :forbidden
  end

  test "an admin closes the form and writes its welcome" do
    form = RequestForm.create!(owner: @team)
    sign_in_as @admin
    patch request_form_path(form), params: { form: { active: false, intro: "Bonjour !" } }, as: :json
    assert_response :success
    assert_equal [ false, "Bonjour !" ], form.reload.values_at(:active, :intro)
  end

  test "someone outside the team sees nothing of it" do
    form = RequestForm.create!(owner: @team)
    sign_in_as users(:alice)
    patch request_form_path(form), params: { form: { active: false } }, as: :json
    assert_response :not_found
    assert_nil users(:alice).as_inertia[:newRequests]
  end
end
