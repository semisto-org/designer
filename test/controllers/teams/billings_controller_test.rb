require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

class Teams::BillingsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = make_user("Admin")
    @member = make_user("Membre")
    @team = make_team("Semisto", admin: @admin, members: [ @member ])
  end

  test "an admin takes the team's maps on their plan, then lets them go" do
    sign_in_as @admin
    patch team_billing_path(@team)
    assert_redirected_to team_path(@team)
    assert_equal @admin, @team.reload.billing_user

    get team_path(@team), headers: inertia_headers
    billing = response.parsed_body["props"]["billing"]
    assert_equal({ "name" => "Admin", "you" => true }, billing["payer"])

    delete team_billing_path(@team)
    assert_nil @team.reload.billing_user
  end

  test "a member can neither take nor drop it, and sees who pays" do
    @team.update!(billing_user: @admin)
    sign_in_as @member
    patch team_billing_path(@team)
    delete team_billing_path(@team)
    assert_equal @admin, @team.reload.billing_user

    get team_path(@team), headers: inertia_headers
    assert_equal({ "name" => "Admin", "you" => false }, response.parsed_body["props"]["billing"]["payer"])
  end

  test "outsiders get a 404" do
    sign_in_as make_user("Dehors")
    patch team_billing_path(@team)
    assert_response :not_found
  end
end
