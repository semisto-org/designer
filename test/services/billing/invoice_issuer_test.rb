require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Billing::InvoiceIssuerTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup do
    @user = users(:bob)
    @request = @user.invoice_requests.create!(
      organization_name: "Administration communale de Yvoir", billing_address: "Rue de l'Hôtel de Ville 1\n5530 Yvoir",
      billing_email: "compta@yvoir.be", company_number: "BE 0207.360.311", purchase_order: "BC-2026-042", plan_key: "bureau"
    )
    @log = Hash.new { |hash, key| hash[key] = [] }
  end

  def stub_invoice_flow(customer: "cus_new", invoice_id: "in_req_1")
    stub_stripe_post("customers", { id: customer }, log: @log[:customer])
    stub_stripe_post("customers/#{customer}", { id: customer }, log: @log[:update])
    stub_stripe_get("customers/#{customer}/tax_ids", { object: "list", data: [] })
    stub_stripe_post("customers/#{customer}/tax_ids", { id: "txi_1", type: "eu_vat", value: "BE0207360311" }, log: @log[:tax_id])
    draft = invoice_request_invoice(@request, id: invoice_id, status: "draft", customer:)
    stub_stripe_post("invoices", draft, log: @log[:invoice])
    stub_stripe_post("invoiceitems", { id: "ii_1" }, log: @log[:item])
    stub_stripe_post("invoices/#{invoice_id}/finalize", draft.merge("status" => "open"), log: @log[:finalize])
    stub_stripe_post("invoices/#{invoice_id}/send", draft.merge("status" => "open"), log: @log[:send])
  end

  def issue(**options) = Billing::InvoiceIssuer.call(@request, by: users(:michael), **options)

  test "creates the customer, attaches the VAT number, then creates, finalizes and sends the invoice" do
    with_billing do
      stub_invoice_flow
      issue

      customer = @log[:customer].sole
      assert_equal [ "Administration communale de Yvoir", "compta@yvoir.be", @user.id.to_s ], [ customer["name"], customer["email"], customer.dig("metadata", "user_id") ]
      assert_equal({ "line1" => "Rue de l'Hôtel de Ville 1", "postal_code" => "5530", "city" => "Yvoir", "country" => "BE" }, customer["address"])
      assert_equal [ "fr" ], customer["preferred_locales"].values
      assert_equal "cus_new", @user.reload.billing_account.stripe_customer_id

      assert_equal({ "type" => "eu_vat", "value" => "BE0207360311" }, @log[:tax_id].sole)

      invoice = @log[:invoice].sole
      assert_equal %w[cus_new send_invoice 30 eur false true exclude], invoice.values_at("customer", "collection_method", "days_until_due", "currency", "auto_advance").push(invoice.dig("automatic_tax", "enabled"), invoice["pending_invoice_items_behavior"])
      assert_equal [ { "name" => "Bon de commande", "value" => "BC-2026-042" } ], invoice["custom_fields"].values
      assert_equal({ "invoice_request_id" => @request.id.to_s, "user_id" => @user.id.to_s, "plan_key" => "bureau" }, invoice["metadata"])

      item = @log[:item].sole
      assert_equal %w[cus_new in_req_1 118800 eur inclusive], item.values_at("customer", "invoice", "amount", "currency", "tax_behavior")
      assert_equal "Semisto Designer — Bureau d'études — 12 mois", item["description"]

      assert_equal 1, @log[:finalize].size
      assert_equal 1, @log[:send].size

      @request.reload
      assert_equal [ "invoiced", "in_req_1", "SEMI-0001", users(:michael) ], [ @request.status, @request.stripe_invoice_id, @request.stripe_invoice_number, @request.handled_by ]
      assert_equal "https://invoice.stripe.com/i/acct/in_req_1", @request.hosted_invoice_url
      assert @request.invoiced_at
    end
  end

  test "reuses the user's Stripe customer and does not add a VAT number twice" do
    with_billing do
      @user.create_billing_account!(stripe_customer_id: "cus_old")
      stub_invoice_flow(customer: "cus_old")
      stub_stripe_get("customers/cus_old/tax_ids", { object: "list", data: [ { id: "txi_0", type: "eu_vat", value: "BE0207360311" } ] })
      issue
      assert_equal [ "compta@yvoir.be", "Administration communale de Yvoir" ], @log[:update].sole.values_at("email", "name")
      assert_not_requested :post, stripe_api("customers")
      assert_empty @log[:tax_id]
    end
  end

  test "without a purchase order or VAT number: no custom field; a company number is printed instead" do
    with_billing do
      @request.update!(purchase_order: nil, company_number: "0207.360.311")
      stub_invoice_flow
      issue
      assert_not_requested :get, stripe_api("customers/cus_new/tax_ids")
      assert_equal [ { "name" => "N° d'entreprise", "value" => "0207.360.311" } ], @log[:invoice].sole["custom_fields"].values
      @request.update_columns(status: "requested", purchase_order: nil, company_number: nil, stripe_invoice_id: nil)
      @log.clear
      stub_stripe_post("invoices", invoice_request_invoice(@request, id: "in_req_2", status: "draft", customer: "cus_new"), log: @log[:invoice])
      stub_stripe_post("invoices/in_req_2/finalize", invoice_request_invoice(@request, id: "in_req_2", status: "open"))
      stub_stripe_post("invoices/in_req_2/send", invoice_request_invoice(@request, id: "in_req_2", status: "open"))
      issue
      assert_nil @log[:invoice].sole["custom_fields"]
    end
  end

  test "a VAT number Stripe refuses is printed on the invoice instead of blocking it" do
    with_billing do
      stub_invoice_flow
      stub_request(:post, stripe_api("customers/cus_new/tax_ids"))
        .to_return(status: 400, body: { error: { type: "invalid_request_error", message: "Invalid value for eu_vat." } }.to_json, headers: { "Content-Type" => "application/json" })
      issue
      assert_includes @log[:invoice].sole["custom_fields"].values, { "name" => "N° d'entreprise", "value" => "BE 0207.360.311" }
      assert @request.reload.invoiced?
    end
  end

  test "a retry after a failure finishes the same draft instead of creating a second invoice" do
    with_billing do
      stub_invoice_flow
      stub_request(:post, stripe_api("invoices/in_req_1/finalize"))
        .to_return(status: 500, body: { error: { type: "api_error", message: "boom" } }.to_json, headers: { "Content-Type" => "application/json" })
      assert_raises(Providers::StripeGateway::Error) { issue }
      assert_equal [ "requested", "in_req_1" ], @request.reload.values_at(:status, :stripe_invoice_id)

      WebMock.reset!
      @log.clear
      stub_invoice_flow
      draft_with_line = invoice_request_invoice(@request, status: "draft", customer: "cus_new").merge("lines" => { "data" => [ { "id" => "il_1" } ] })
      stub_stripe_get("invoices/in_req_1", draft_with_line)
      issue
      assert_empty @log[:invoice]
      assert_empty @log[:item]
      assert_equal 1, @log[:finalize].size
      assert @request.reload.invoiced?
    end
  end

  test "creates a new customer when the saved one is unknown to Stripe" do
    with_billing do
      @user.create_billing_account!(stripe_customer_id: "cus_test_mode")
      stub_request(:post, stripe_api("customers/cus_test_mode"))
        .to_return(status: 400, body: { error: { type: "invalid_request_error", message: "No such customer: 'cus_test_mode'" } }.to_json, headers: { "Content-Type" => "application/json" })
      stub_invoice_flow
      issue
      assert_equal "cus_new", @user.reload.billing_account.stripe_customer_id
    end
  end

  test "nothing happens without Stripe, or once the request is invoiced" do
    assert_equal :not_configured, assert_raises(Billing::InvoiceIssuer::Unavailable) { issue }.reason
    with_billing do
      @request.update!(status: "invoiced")
      assert_equal :not_requested, assert_raises(Billing::InvoiceIssuer::Unavailable) { issue }.reason
    end
    assert_not_requested :post, /api\.stripe\.com/
  end
end
