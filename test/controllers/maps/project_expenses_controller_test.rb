require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

# Noting a project's expenses: the team any of them, with a receipt; the
# client only their own purchases, once the team shows them the project.
class Maps::ProjectExpensesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @designer = users(:bob)
    @team = make_team("Semisto", admin: users(:michael), members: [ @designer ])
    @map.update!(organization: @team)
  end

  def params(**overrides)
    { expense: { label: "Protections", spent_on: Date.current.iso8601, amount: "120,50", category: "protections", paid_by: "rebilled" }.merge(overrides) }
  end

  test "the team notes an expense with its receipt, and reads the receipt back" do
    sign_in_as @designer
    post map_project_expenses_path(@map), params: params(receipt: fixture_file_upload("analyse_sol.pdf", "application/pdf")), as: :multipart
    assert_response :created
    expense = @map.project_expenses.sole
    assert_equal [ 12_050, 21, @designer ], [ expense.amount_cents, expense.vat_rate, expense.user ]
    assert expense.receipt.attached?
    assert_equal receipt_map_project_expense_path(@map, expense), response.parsed_body.dig("expense", "receipt", "url")

    get receipt_map_project_expense_path(@map, expense)
    assert_response :redirect
  end

  test "a plant purchase defaults to 6 % VAT" do
    sign_in_as @designer
    post map_project_expenses_path(@map), params: params(category: "plants"), as: :json
    assert_equal 6, @map.project_expenses.sole.vat_rate
  end

  test "the client notes nothing until the team shows them the project, then only their own purchases" do
    sign_in_as users(:alice)
    post map_project_expenses_path(@map), params: params(paid_by: "client"), as: :json
    assert_response :forbidden

    @map.update!(time_shared_with_client: true)
    post map_project_expenses_path(@map), params: params(paid_by: "rebilled"), as: :json
    assert_response :forbidden
    post map_project_expenses_path(@map), params: params(paid_by: "client"), as: :json
    assert_response :created
    refute response.parsed_body["expense"].key?("userName")

    team_one = @map.project_expenses.create!(user: @designer, spent_on: Date.current, label: "Plants", category: "plants", amount_cents: 100, paid_by: "client")
    patch map_project_expense_path(@map, team_one), params: { expense: { label: "Mine now" } }, as: :json
    assert_response :forbidden
    delete map_project_expense_path(@map, team_one)
    assert_response :forbidden
  end

  test "the client cannot read the team's receipts" do
    expense = @map.project_expenses.new(user: @designer, spent_on: Date.current, label: "Plants", category: "plants", amount_cents: 100, paid_by: "rebilled")
    expense.receipt.attach(io: file_fixture("analyse_sol.pdf").open, filename: "ticket.pdf", content_type: "application/pdf")
    expense.save!
    @map.update!(time_shared_with_client: true)
    sign_in_as users(:alice)
    get receipt_map_project_expense_path(@map, expense)
    assert_response :not_found
  end

  test "only the team turns « Montrer au client » on" do
    sign_in_as users(:alice)
    patch map_time_sharing_path(@map), params: { shared: true }, as: :json
    assert_response :forbidden
    sign_in_as @designer
    patch map_time_sharing_path(@map), params: { shared: true }, as: :json
    assert_response :success
    assert @map.reload.time_shared_with_client
  end
end
