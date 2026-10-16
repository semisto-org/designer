require "test_helper"

# Logos printed at the top of a map's documents: chosen by a pro in « Mon
# compte » and by a team's admins, served without a session.
class LogosControllersTest < ActionDispatch::IntegrationTest
  setup { @user = users(:michael) }

  test "a pro chooses and removes the logo of their account" do
    sign_in_as @user
    patch account_logo_path, params: { user: { logo: fixture_file_upload("plant.png", "image/png") } }
    assert_redirected_to account_path
    assert @user.reload.logo.attached?
    assert_equal logo_path(@user.logo.blob.signed_id), @user.logo_url

    delete account_logo_path
    assert_not @user.reload.logo.attached?
  end

  test "refuses a file that is not an image" do
    sign_in_as @user
    patch account_logo_path, params: { user: { logo: fixture_file_upload("notes.txt", "text/plain") } }
    assert_redirected_to account_path
    assert_not @user.reload.logo.attached?
  end

  test "only a team's admins choose its logo" do
    team = Organization.create_with_admin!(@user, name: "Semisto")
    team.memberships.create!(user: users(:alice), role: "member")
    sign_in_as users(:alice)
    patch team_logo_path(team), params: { team: { logo: fixture_file_upload("plant.png", "image/png") } }
    assert_not team.reload.logo.attached?

    sign_in_as @user
    patch team_logo_path(team), params: { team: { logo: fixture_file_upload("plant.png", "image/png") } }
    assert_redirected_to team_path(team)
    assert team.reload.logo.attached?
    get team_path(team), headers: inertia_headers
    assert_equal team.logo_url, response.parsed_body["props"]["team"]["logoUrl"]
  end

  test "a logo opens without a session; an avatar's key does not open it" do
    @user.logo.attach(fixture_file_upload("plant.png", "image/png"))
    get @user.logo_url
    assert_response :redirect

    @user.avatar.attach(fixture_file_upload("plant.png", "image/png"))
    get logo_path(@user.avatar.blob.signed_id)
    assert_response :not_found
  end
end
