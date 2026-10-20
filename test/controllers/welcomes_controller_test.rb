require "test_helper"

class WelcomesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @newcomer = User.create!(email_address: "newcomer@example.org", name: "Camille Durand")
  end

  def props = response.parsed_body["props"]

  test "« Mes cartes » asks a new account who it designs for, once" do
    sign_in_as @newcomer
    get maps_path
    assert_redirected_to welcome_path

    get welcome_path, headers: inertia_headers
    assert_response :success
    assert_equal "welcomes/show", response.parsed_body["component"]
    assert_equal "Camille", props["name"]
    assert_nil props["accountKind"]
    assert_equal Billing::Catalog.find("yearly").price_cents, props["prices"]["yearly"]

    patch welcome_path, params: { account_kind: "professional" }
    assert_redirected_to maps_path
    assert @newcomer.reload.professional?

    get maps_path, headers: inertia_headers
    assert_response :success
    assert_equal "professional", props["currentUser"]["accountKind"]
  end

  test "an unknown kind is refused" do
    sign_in_as @newcomer
    patch welcome_path, params: { account_kind: "admin" }
    assert_redirected_to welcome_path
    assert_nil @newcomer.reload.account_kind
  end

  test "an account that already chose goes straight to its maps" do
    sign_in_as users(:alice)
    get maps_path, headers: inertia_headers
    assert_response :success
  end

  test "an admin signed in as someone is not stopped by the question and cannot answer it" do
    admin = User.create!(email_address: "staff@example.org", admin: true, account_kind: "individual")
    sign_in_as admin
    post admin_user_impersonation_path(@newcomer)

    get maps_path, headers: inertia_headers
    assert_response :success
    patch welcome_path, params: { account_kind: "individual" }
    assert_nil @newcomer.reload.account_kind
  end

  test "signed out, the welcome page asks to sign in" do
    get welcome_path
    assert_redirected_to new_session_path
  end

  test "an account that came in with its place is asked at its second map, then goes on creating it" do
    @newcomer.owned_maps.create!(name: "Le terrain de Purnode", region: regions(:wallonia))
    sign_in_as @newcomer
    get maps_path, headers: inertia_headers
    assert_response :success

    get new_map_path
    assert_redirected_to welcome_path
    patch welcome_path, params: { account_kind: "individual" }
    assert_redirected_to new_map_path
    get new_map_path, headers: inertia_headers
    assert_response :success
  end
end
