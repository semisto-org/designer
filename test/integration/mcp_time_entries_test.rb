require "test_helper"
require "test_helpers/mcp_test_helper"
require_relative "../test_helpers/teams_test_helper"

# The person's AI notes the hours they tell it, and reads where a project
# stands; the client's AI reads nothing of it.
class McpTimeEntriesTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @team = make_team("Semisto", admin: users(:michael), members: [ users(:bob) ])
    @map.update!(organization: @team)
    @designer = personal_token(users(:bob))
    @client = personal_token(users(:alice))
  end

  test "record_time_entries notes the person's own hours, and list_time_entries reads them back" do
    data, error = call_tool(@designer, "record_time_entries", { lines: [
      { map_id: @map.id, worked_on: Date.current.iso8601, hours: 2.5, phase: "pre_design", note: "Visite", trip_km: 64 },
      { map_id: @map.id, worked_on: Date.current.iso8601, hours: 1, phase: "design", billable: false, non_billable_reason: "offered" },
      { map_id: @map.id, worked_on: (Date.current + 60).iso8601, hours: 1, phase: "design" }
    ] })
    refute error, data
    assert_equal 2, data["created"].size
    assert_equal 1, data["rejected"].size
    entry = users(:bob).time_entries.order(:id).first
    assert_equal [ 150, "mcp", "Semisto" ], [ entry.minutes, entry.source, entry.bill_to ]

    data, error = call_tool(@designer, "list_time_entries", {})
    refute error, data
    assert_equal 2, data["entries_count"]
    assert_equal 2.5, data["to_invoice"].sole["hours"]
    assert_equal [ @map.id ], data["projects"].map { _1["map_id"] }

    data, error = call_tool(@designer, "list_time_entries", { map_id: @map.id })
    refute error, data
    pre = data["phases"].find { _1["phase"] == "pre_design" }
    assert_equal 2.5, pre["hours"]
    assert_equal 64.0, pre["km"]
    refute data.to_json.include?("rate")
  end

  test "the client's AI cannot read nor note the project's time" do
    _, error = call_tool(@client, "list_time_entries", { map_id: @map.id })
    assert error
    _, error = call_tool(@client, "record_time_entries", { lines: [ { map_id: @map.id, worked_on: Date.current.iso8601, hours: 1, phase: "design" } ] })
    assert error
    assert_equal 0, TimeEntry.count
  end

  test "record_project_expenses notes the team's expenses, and the client's own purchases once shown the project" do
    data, error = call_tool(@designer, "record_project_expenses", { lines: [
      { map_id: @map.id, spent_on: Date.current.iso8601, label: "Broyat", amount_eur: 480, category: "mulch", paid_by: "rebilled", supplier: "Scierie" },
      { map_id: @map.id, spent_on: Date.current.iso8601, label: "Pommiers", amount_eur: 250, category: "plants", paid_by: "team" }
    ] })
    refute error, data
    assert_equal 2, data["created"].size
    assert_equal [ 21, 6 ], @map.project_expenses.order(:id).pluck(:vat_rate)

    _, error = call_tool(@client, "record_project_expenses", { lines: [ { map_id: @map.id, spent_on: Date.current.iso8601, label: "Paille", amount_eur: 30, category: "mulch", paid_by: "client" } ] })
    assert error
    @map.update!(time_shared_with_client: true)
    data, error = call_tool(@client, "record_project_expenses", { lines: [ { map_id: @map.id, spent_on: Date.current.iso8601, label: "Paille", amount_eur: 30, category: "mulch", paid_by: "client" } ] })
    refute error, data

    data, error = call_tool(@client, "list_time_entries", { map_id: @map.id })
    refute error, data
    assert_equal "client", data["view"]
    assert_equal 3, data["expenses"].size
    refute data["expenses"].any? { _1.key?("person") }
    refute data.to_json.include?("Scierie"), "the team's supplier stays the team's"
    broyat = data["expenses"].find { _1["label"] == "Broyat" }
    refute broyat.key?("amount_eur"), "nor its purchase price"
    assert_equal 30.0, data["expenses"].find { _1["label"] == "Paille" }["amount_eur"]
    assert_equal 30.0, data["own_purchases_eur"]
    refute data["by_payer"].find { _1["paid_by"] == "rebilled" }.key?("amount_eur")

    data, error = call_tool(@designer, "list_time_entries", { map_id: @map.id })
    refute error, data
    assert_equal 760.0, data["expense_summary"]["total_eur"]
  end
end
