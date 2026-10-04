require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Admin::InvoiceRequestsControllerTest < ActionDispatch::IntegrationTest
  include BillingTestHelper

  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @user = users(:bob)
    @pending = @user.invoice_requests.create!(organization_name: "Administration communale de Yvoir", billing_address: "Rue 1\n5530 Yvoir",
                                              billing_email: "compta@yvoir.be", company_number: "BE0207360311", purchase_order: "BC-42", plan_key: "bureau")
    @paid = users(:alice).invoice_requests.create!(organization_name: "École du Bois", billing_address: "Rue 2\n5000 Namur",
                                                   billing_email: "eco@ecole.be", plan_key: "atelier")
    @paid.update!(status: "paid", paid_at: 1.day.ago)
  end

  def props
    response.parsed_body["props"]
  end

  test "requires sign in" do
    get admin_invoice_requests_path
    assert_redirected_to new_session_path
  end

  test "regular users get a 404 on the list and on every action" do
    sign_in_as users(:michael)
    get admin_invoice_requests_path
    assert_response :not_found
    %i[invoice mark_paid cancel activate].each do |action|
      post url_for([ action, :admin, @pending ])
      assert_response :not_found, action
    end
    assert @pending.reload.requested?
    assert_nil @pending.plan_grant
  end

  test "admins list open requests by default, with counts and details" do
    sign_in_as @admin
    get admin_invoice_requests_path, headers: inertia_headers
    assert_response :success
    assert_equal "admin/invoice_requests/index", response.parsed_body["component"]
    assert_equal [ @pending.id ], props["requests"].map { _1["id"] }
    assert_equal({ "open" => 1, "paid" => 1, "cancelled" => 0, "all" => 2 }, props["counts"])
    assert_equal false, props["stripeEnabled"]
    row = props["requests"].sole
    assert_equal [ "Administration communale de Yvoir", "compta@yvoir.be", "BC-42", true, 118_800, "Bob" ],
      row.values_at("organizationName", "billingEmail", "purchaseOrder", "euVat", "amountCents").push(row.dig("user", "name"))
    assert_equal "Rue 1, 5530 Yvoir, BE", row["stripeAddress"]
    assert_equal Date.current.iso8601, row["suggestedStart"]

    get admin_invoice_requests_path(status: "paid"), headers: inertia_headers
    assert_equal [ @paid.id ], props["requests"].map { _1["id"] }
    get admin_invoice_requests_path(status: "all"), headers: inertia_headers
    assert_equal 2, props["requests"].size
  end

  test "with Stripe, staff are offered the Stripe invoice" do
    sign_in_as @admin
    with_billing { get admin_invoice_requests_path, headers: inertia_headers }
    assert props["stripeEnabled"]
  end

  test "activates the plan for 12 months from the date typed, then not twice" do
    sign_in_as @admin
    post activate_admin_invoice_request_path(@pending), params: { starts_on: "2026-11-02" }
    assert_response :see_other
    grant = @pending.reload.plan_grant
    assert_equal [ Time.zone.local(2026, 11, 2), Time.zone.local(2027, 11, 2), @admin ], [ grant.starts_at, grant.ends_at, grant.granted_by ]
    assert_equal "Formule Bureau d'études activée du 2 novembre 2026 au 2 novembre 2027.", flash[:notice]
    assert_no_difference("PlanGrant.count") { post activate_admin_invoice_request_path(@pending) }
  end

  test "activates from today by default and refuses a wrong date" do
    sign_in_as @admin
    post activate_admin_invoice_request_path(@pending), params: { starts_on: "31/02/2026" }
    assert_equal "Cette date n'est pas valide.", flash[:alert]
    assert_nil @pending.reload.plan_grant
    post activate_admin_invoice_request_path(@pending)
    assert_in_delta Time.current, @pending.reload.plan_grant.starts_at, 5
    assert_equal "bureau", @user.reload.current_plan_key
  end

  test "marks a request made by hand as paid, and starts its plan" do
    sign_in_as @admin
    post mark_paid_admin_invoice_request_path(@pending)
    assert_response :see_other
    @pending.reload
    assert_equal [ "paid", @admin ], [ @pending.status, @pending.handled_by ]
    assert @pending.plan_grant.active?
    assert_equal "Demande marquée comme payée.", flash[:notice]
  end

  test "cancels a request and stops its plan; a closed request cannot be changed" do
    sign_in_as @admin
    @pending.activate!
    post cancel_admin_invoice_request_path(@pending)
    assert @pending.reload.cancelled?
    assert @pending.plan_grant.revoked?
    post activate_admin_invoice_request_path(@pending)
    assert_equal "Cette demande est close.", flash[:alert]
    post mark_paid_admin_invoice_request_path(@paid)
    assert_equal "Cette demande est close.", flash[:alert]
    post cancel_admin_invoice_request_path(@paid)
    assert @paid.reload.paid?
  end

  test "creating the Stripe invoice needs Stripe" do
    sign_in_as @admin
    post invoice_admin_invoice_request_path(@pending)
    assert_equal "Stripe n'est pas configuré : faites la facture à la main.", flash[:alert]
    assert @pending.reload.requested?
  end

  test "creates and sends the Stripe invoice" do
    sign_in_as @admin
    with_billing do
      stub_stripe_post("customers", { id: "cus_new" })
      stub_stripe_get("customers/cus_new/tax_ids", { object: "list", data: [] })
      stub_stripe_post("customers/cus_new/tax_ids", { id: "txi_1" })
      stub_stripe_post("invoices", invoice_request_invoice(@pending, status: "draft", customer: "cus_new"))
      stub_stripe_post("invoiceitems", { id: "ii_1" })
      stub_stripe_post("invoices/in_req_1/finalize", invoice_request_invoice(@pending, status: "open"))
      stub_stripe_post("invoices/in_req_1/send", invoice_request_invoice(@pending, status: "open"))
      post invoice_admin_invoice_request_path(@pending)
      assert_equal "Facture envoyée à compta@yvoir.be.", flash[:notice]
      assert_equal [ "invoiced", "in_req_1", @admin ], @pending.reload.values_at(:status, :stripe_invoice_id).push(@pending.handled_by)
    end
  end

  test "a Stripe refusal is shown to staff and changes nothing" do
    sign_in_as @admin
    with_billing do
      stub_request(:post, stripe_api("customers"))
        .to_return(status: 400, body: { error: { type: "invalid_request_error", message: "Invalid email address" } }.to_json, headers: { "Content-Type" => "application/json" })
      post invoice_admin_invoice_request_path(@pending)
      assert_equal "Stripe a refusé l'opération : Invalid email address", flash[:alert]
      assert @pending.reload.requested?
    end
  end
end
