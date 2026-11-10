require "test_helper"
require_relative "../test_helpers/teams_test_helper"

# « Mes heures »: noting, changing and invoicing one's own hours.
class TimeEntriesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @designer = users(:bob)
    @team = make_team("Semisto", admin: users(:michael), members: [ @designer ])
    @map.update!(organization: @team)
  end

  def note(user = @designer, **attributes)
    post time_entries_path, params: { time_entry: { map_id: @map.id, worked_on: Date.current.iso8601, minutes: 150, phase: "pre_design", note: "Visite du terrain" }.merge(attributes) }, as: :json
  end

  test "a team member notes hours, the recipient defaults to the team, and the page shows them" do
    sign_in_as @designer
    assert_difference -> { @designer.time_entries.count } do
      note(trip_km: 64, trip_from: "Yvoir", trip_to: "Erpent")
    end
    assert_response :created
    assert_equal "Semisto", @designer.time_entries.last.bill_to

    get time_entries_path, headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal 1, props["entries"].size
    assert_equal [ { "billTo" => "Semisto", "minutes" => 150, "km" => 64.0 } ], props["toInvoice"].map { _1.slice("billTo", "minutes", "km") }
    choice = props["maps"].sole
    assert_equal({ "km" => 64.0, "from" => "Yvoir", "to" => "Erpent" }, choice["usualTrip"])
    assert_equal "pre_design", choice["defaultPhase"]
  end

  test "the client, a viewer of the map, cannot note time" do
    sign_in_as users(:alice)
    assert_no_difference -> { TimeEntry.count } do
      note(users(:alice))
    end
    assert_response :forbidden
  end

  test "only one's own entries change, and never once invoiced" do
    sign_in_as @designer
    note
    entry = @designer.time_entries.last
    patch time_entry_path(entry), params: { time_entry: { minutes: 45 } }, as: :json
    assert_response :success
    assert_equal 45, entry.reload.minutes

    entry.update!(invoiced_at: Time.current, invoice_number: "F-1")
    patch time_entry_path(entry), params: { time_entry: { minutes: 60 } }, as: :json
    assert_response :unprocessable_content
    delete time_entry_path(entry), as: :json
    assert_response :unprocessable_content

    sign_in_as users(:michael)
    delete time_entry_path(entry), as: :json
    assert_response :not_found
  end

  test "the statement page, marking it invoiced, then taking the invoice back" do
    sign_in_as @designer
    note
    get time_statement_path(bill_to: "Semisto"), headers: inertia_headers
    statement = response.parsed_body["props"]["statement"]
    assert_equal 150, statement["totals"]["minutes"]
    assert_equal @map.name, statement["projects"].sole["name"]

    post time_statement_path, params: { bill_to: "Semisto", invoice_number: "" }, as: :json
    assert_response :unprocessable_content
    post time_statement_path, params: { bill_to: "Semisto", invoice_number: "2026-012" }, as: :json
    assert_equal 1, response.parsed_body["invoiced"]
    assert @designer.time_entries.last.invoiced?

    delete time_statement_path, params: { bill_to: "Semisto", invoice_number: "2026-012" }, as: :json
    assert_equal 1, response.parsed_body["reopened"]
    refute @designer.time_entries.last.invoiced?
  end
end
