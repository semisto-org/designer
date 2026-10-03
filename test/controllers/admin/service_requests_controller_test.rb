require "test_helper"

class Admin::ServiceRequestsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @map = maps(:ahinvaux)
    @pending = @map.service_requests.create!(user: users(:michael), kind: "order_plants", contact_consent: true,
                                              payload: { "plants" => [ { "name" => "Noyer", "quantity" => 2 } ], "phone" => "0470" })
    @closed = @map.service_requests.create!(user: users(:alice), kind: "co_management", contact_consent: true, payload: { "message" => "Suivi" })
    @closed.update!(status: "closed")
  end

  test "requires sign in" do
    get admin_requests_path
    assert_redirected_to new_session_path
  end

  test "regular users get a 404, not a login hint" do
    sign_in_as users(:michael)
    get admin_requests_path
    assert_response :not_found
    patch admin_request_path(@pending), params: { service_request: { status: "closed" } }
    assert_response :not_found
    assert_equal "new", @pending.reload.status
  end

  test "admins list open requests by default, with counts and details" do
    sign_in_as @admin
    get admin_requests_path, headers: inertia_headers
    assert_response :success
    body = response.parsed_body
    assert_equal "admin/requests/index", body["component"]
    props = body["props"]
    assert_equal [ @pending.id ], props["requests"].map { _1["id"] }
    assert_equal({ "new" => 1, "contacted" => 0, "closed" => 1, "open" => 1, "all" => 2 }, props["counts"])
    row = props["requests"].first
    assert_equal "order_plants", row["kind"]
    assert_equal "Michael", row.dig("user", "name")
    assert_equal "michael@example.org", row.dig("user", "email")
    assert_equal @map.id, row.dig("map", "id")
    assert_equal "0470", row.dig("payload", "phone")
    assert_equal "Domaine d'Ahinvaux", row.dig("snapshot", "map_name")
  end

  test "filters by status and kind" do
    sign_in_as @admin
    get admin_requests_path(status: "closed"), headers: inertia_headers
    assert_equal [ @closed.id ], response.parsed_body["props"]["requests"].map { _1["id"] }
    get admin_requests_path(status: "all", kind: "order_plants"), headers: inertia_headers
    assert_equal [ @pending.id ], response.parsed_body["props"]["requests"].map { _1["id"] }
    get admin_requests_path(status: "bogus"), headers: inertia_headers
    assert_equal "open", response.parsed_body["props"]["filters"]["status"]
  end

  test "admins update status and notes, and are recorded as handler" do
    sign_in_as @admin
    patch admin_request_path(@pending), params: { service_request: { status: "contacted", admin_notes: "Rappelé le lundi" } }
    assert_response :see_other
    @pending.reload
    assert_equal "contacted", @pending.status
    assert_equal "Rappelé le lundi", @pending.admin_notes
    assert_equal @admin, @pending.handled_by
    assert @pending.contacted_at.present?
  end

  test "an invalid status is refused" do
    sign_in_as @admin
    patch admin_request_path(@pending), params: { service_request: { status: "weird" } }
    assert_response :see_other
    assert_equal "new", @pending.reload.status
  end

  test "admins cannot change what the person sent" do
    sign_in_as @admin
    patch admin_request_path(@pending), params: { service_request: { status: "closed", payload: { phone: "x" }, kind: "co_management" } }
    @pending.reload
    assert_equal "order_plants", @pending.kind
    assert_equal "0470", @pending.payload["phone"]
  end

  test "closing a request ends the staff access to the map, the page still lists it" do
    sign_in_as @admin
    get map_path(@map), headers: inertia_headers
    assert_response :success
    patch admin_request_path(@pending), params: { service_request: { status: "closed" } }
    get map_path(@map)
    assert_response :not_found
  end
end
