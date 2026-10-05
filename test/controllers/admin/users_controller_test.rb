require "test_helper"

class Admin::UsersControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
  end

  def props = response.parsed_body["props"]

  test "regular users get a 404" do
    sign_in_as users(:alice)
    get admin_users_path
    assert_response :not_found
    patch admin_user_path(users(:alice)), params: { admin: true }
    assert_response :not_found
    assert_not users(:alice).reload.admin?
  end

  test "lists and searches the accounts" do
    sign_in_as @admin
    get admin_users_path, headers: inertia_headers
    assert_response :success
    assert_equal User.count, props["pagination"]["total"]
    alice = props["users"].find { |row| row["email"] == "alice@example.org" }
    assert_equal "free", alice["plan"]
    assert_equal Map.active.where(owner: users(:alice)).count, alice["mapsCount"]

    get admin_users_path(q: "ALI"), headers: inertia_headers
    assert_equal [ "alice@example.org" ], props["users"].map { |row| row["email"] }
    assert_equal "ALI", props["filters"]["q"]
  end

  test "pages by 50" do
    55.times { |i| User.create!(email_address: "u#{i}@example.org") }
    sign_in_as @admin
    get admin_users_path(page: 2), headers: inertia_headers
    assert_equal 2, props["pagination"]["page"]
    assert_equal User.count - 50, props["users"].size
    get admin_users_path(page: 99), headers: inertia_headers
    assert_equal 2, props["pagination"]["page"]
  end

  test "gives and takes the admin role, logged" do
    sign_in_as @admin
    alice = users(:alice)
    patch admin_user_path(alice), params: { admin: "true" }
    assert alice.reload.admin?
    assert_equal "admin_granted", AdminEvent.newest_first.first.action
    patch admin_user_path(alice), params: { admin: "false" }
    assert_not alice.reload.admin?
    assert_equal "admin_revoked", AdminEvent.newest_first.first.action
    assert_no_difference("AdminEvent.count") { patch admin_user_path(alice), params: { admin: "false" } }
  end

  test "never one's own role" do
    sign_in_as @admin
    patch admin_user_path(@admin), params: { admin: "false" }
    assert @admin.reload.admin?
    assert_equal "Tu ne peux pas changer ton propre rôle.", flash[:alert]
  end
end
