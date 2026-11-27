require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

# Recording the invoices sent to the client, and the budget set by hand:
# the project's team only, never its client.
class Maps::ProjectInvoicesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @designer = users(:bob)
    @team = make_team("Semisto", admin: users(:michael), members: [ @designer ])
    @map.update!(organization: @team)
  end

  def params(**overrides)
    { invoice: { number: "2026-042", issued_on: Date.current.iso8601, vat: "420", items: { services: "1 800,00", expenses: "200", plants: "", implementation: "0" } }.merge(overrides) }
  end

  test "the team records an invoice with its PDF, reads the PDF back, changes and removes it" do
    sign_in_as @designer
    post map_project_invoices_path(@map), params: params(document: fixture_file_upload("analyse_sol.pdf", "application/pdf")), as: :multipart
    assert_response :created
    invoice = @map.project_invoices.sole
    assert_equal [ 180_000, 20_000, 0, 42_000, "web", @designer ], [ invoice.services_cents, invoice.expenses_cents, invoice.plants_cents, invoice.vat_cents, invoice.source, invoice.user ]
    assert invoice.document.attached?
    get document_map_project_invoice_path(@map, invoice)
    assert_response :redirect

    patch map_project_invoice_path(@map, invoice), params: { invoice: { paid_on: Date.current.iso8601 } }, as: :json
    assert_response :success
    assert invoice.reload.paid?

    delete map_project_invoice_path(@map, invoice)
    assert_response :no_content
    assert_empty @map.project_invoices
  end

  test "an invoice with nothing on it, or a number already recorded, is refused" do
    sign_in_as @designer
    post map_project_invoices_path(@map), params: params(items: { services: "0" }), as: :json
    assert_response :unprocessable_content
    post map_project_invoices_path(@map), params: params, as: :json
    post map_project_invoices_path(@map), params: params, as: :json
    assert_response :unprocessable_content
    assert_equal 1, @map.project_invoices.count
  end

  test "the client records nothing and reads no PDF, even shown the project" do
    invoice = @map.project_invoices.new(number: "1", issued_on: Date.current, services_cents: 100)
    invoice.document.attach(io: file_fixture("analyse_sol.pdf").open, filename: "f.pdf", content_type: "application/pdf")
    invoice.save!
    @map.update!(time_shared_with_client: true)
    sign_in_as users(:alice)
    post map_project_invoices_path(@map), params: params, as: :json
    assert_response :forbidden
    get document_map_project_invoice_path(@map, invoice)
    assert_response :forbidden
    patch map_project_budget_path(@map), params: { items: { services: "100" } }, as: :json
    assert_response :forbidden
  end

  test "the team sets an item's budget by hand, and clears it to read the offer again" do
    sign_in_as @designer
    patch map_project_budget_path(@map), params: { items: { services: "2 500", plants: "800,50" } }, as: :json
    assert_response :success
    assert_equal({ "services" => 250_000, "plants" => 80_050 }, @map.reload.budget_overrides)
    assert_equal 250_000, response.parsed_body.dig("budget", "items", 0, "budgetCents")

    patch map_project_budget_path(@map), params: { items: { services: "" } }, as: :json
    assert_equal({ "plants" => 80_050 }, @map.reload.budget_overrides)
    patch map_project_budget_path(@map), params: { items: { plants: "beaucoup" } }, as: :json
    assert_response :unprocessable_content
  end

  test "the project's page carries the budget and the invoices" do
    @map.project_invoices.create!(number: "1", issued_on: Date.current, services_cents: 100)
    sign_in_as @designer
    get map_time_entries_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal %w[services expenses plants implementation], props.dig("budget", "items").map { _1["key"] }
    assert_equal [ "1" ], props["invoices"].map { _1["number"] }
  end
end
