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

  test "import_time_entries brings a team member's hours once, and only for a team admin" do
    admin = personal_token(users(:michael))
    line = { person: users(:bob).display_name.upcase, external_ref: "my.semisto.org/recordings/1", worked_on: "2026-10-01", hours: 4, phase: "pre_design", note: "Analyse" }
    visit = { person: users(:michael).display_name, external_ref: "my.semisto.org/recordings/2", worked_on: "2026-08-24", hours: 1, phase: "commercial", billable: false, non_billable_reason: "offered", trip_km: 171 }
    data, error = call_tool(admin, "import_time_entries", { map_id: @map.id, lines: [ line, visit, line.merge(person: "Personne", external_ref: "x") ] })
    refute error, data
    assert_equal 2, data["created"].size
    assert_equal 1, data["rejected"].size
    bob = users(:bob).time_entries.sole
    assert_equal [ "import", "my.semisto.org/recordings/1", 240, "Semisto" ], [ bob.source, bob.external_ref, bob.minutes, bob.bill_to ]
    assert_equal [ 4.0, 4.0 ], data["totals"].find { _1["person"] == users(:bob).display_name }.values_at("hours", "billable_hours")
    assert_equal 171.0, data["totals"].find { _1["person"] == users(:michael).display_name }["km"]

    data, error = call_tool(admin, "import_time_entries", { map_id: @map.id, lines: [ line ] })
    refute error, data
    assert_equal [ 0, 1 ], [ data["created"].size, data["skipped"].size ]
    assert_equal 2, TimeEntry.count

    _, error = call_tool(@designer, "import_time_entries", { map_id: @map.id, lines: [ line.merge(external_ref: "y") ] })
    assert error, "a member imports nobody's hours"
    assert_equal 2, TimeEntry.count
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

  test "record_client_invoices records the team's invoices item by item, and get_project_budget reads them back" do
    @map.update!(budget_overrides: { "services" => 300_000 })
    data, error = call_tool(@designer, "record_client_invoices", { invoices: [
      { map_id: @map.id, number: "2026-042", issued_on: Date.current.iso8601, items_eur: { services: 1_800, plants: 100 } },
      { map_id: @map.id, number: "2026-042", issued_on: Date.current.iso8601, items_eur: { services: 1 } }
    ] })
    refute error, data
    assert_equal 1, data["created"].size
    assert_equal 1, data["rejected"].size, "a number is recorded once"
    invoice = @map.project_invoices.sole
    assert_equal [ 180_000, 10_000, 37_800 + 600, "mcp" ], [ invoice.services_cents, invoice.plants_cents, invoice.vat_cents, invoice.source ]

    data, error = call_tool(@designer, "get_project_budget", { map_id: @map.id })
    refute error, data
    services = data["items"].find { _1["item"] == "services" }
    assert_equal [ 3_000.0, "manual", 1_800.0, 1_200.0, "partly" ], services.values_at("budget_eur", "budget_source", "invoiced_eur", "left_to_invoice_eur", "status")
    assert_equal "2026-042", data["invoices"].sole["number"]

    data, error = call_tool(@designer, "get_map", { map_id: @map.id })
    refute error, data
    assert_equal 1_800.0, data.dig("time_entries", "budget", "items").find { _1["item"] == "services" }["invoiced_eur"]
  end

  test "the client's AI neither reads the budget nor records an invoice" do
    @map.update!(time_shared_with_client: true)
    _, error = call_tool(@client, "get_project_budget", { map_id: @map.id })
    assert error
    _, error = call_tool(@client, "record_client_invoices", { invoices: [ { map_id: @map.id, number: "X", issued_on: Date.current.iso8601, items_eur: { services: 10 } } ] })
    assert error
    assert_empty @map.project_invoices
  end
end
