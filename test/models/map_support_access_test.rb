require "test_helper"

# Semisto staff (admins) can read a map while a request sent from it is open.
class MapSupportAccessTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
  end

  def send_request(status: "new", consent: true)
    request = @map.service_requests.create!(user: users(:michael), kind: "co_management", contact_consent: true, payload: { "message" => "Bonjour" })
    request.update_columns(status:, contact_consent: consent)
    request
  end

  test "an admin cannot see a map without a request" do
    assert_nil @map.role_for(@admin)
    assert_not @map.viewable_by?(@admin)
  end

  test "an admin reads, but cannot edit, a map with an open request" do
    send_request
    assert_equal "viewer", @map.role_for(@admin)
    assert @map.viewable_by?(@admin)
    assert_not @map.editable_by?(@admin)
    assert_not @map.manageable_by?(@admin)
  end

  test "contacted requests are still open, closed ones end the access" do
    request = send_request(status: "contacted")
    assert_equal "viewer", @map.role_for(@admin)
    request.update!(status: "closed")
    assert_nil @map.role_for(@admin)
  end

  test "no access without the owner's consent" do
    send_request(consent: false)
    assert_nil @map.role_for(@admin)
  end

  test "regular users never get access from a request" do
    send_request
    assert_nil @map.role_for(users(:bob))
  end

  test "an admin keeps their own membership role when they have one" do
    send_request
    @map.memberships.create!(user: @admin, role: "editor")
    assert_equal "editor", @map.role_for(@admin)
  end

  test "the requests of another map do not open this one" do
    other = Map.create!(name: "Autre", owner: users(:bob), region: regions(:wallonia))
    other.service_requests.create!(user: users(:bob), kind: "co_management", contact_consent: true, payload: { "message" => "Salut" })
    assert_nil @map.role_for(@admin)
    assert_equal "viewer", other.role_for(@admin)
  end
end
