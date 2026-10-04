require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Billing::InvoiceSettlementTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup do
    @user = users(:bob)
    @staff = users(:michael)
    @request = @user.invoice_requests.create!(organization_name: "École du Bois", billing_address: "Rue 2\n5000 Namur",
                                              billing_email: "eco@ecole.be", plan_key: "atelier")
  end

  def invoiced!
    @request.update!(status: "invoiced", stripe_invoice_id: "in_req_1")
  end

  test "by hand: marking paid records who did it and starts the plan, without Stripe" do
    Billing::InvoiceSettlement.mark_paid(@request, by: @staff)
    assert_equal [ "paid", @staff ], [ @request.status, @request.handled_by ]
    assert @request.plan_grant.active?
    assert_not_requested :post, /api\.stripe\.com/

    # The revenue-share ledger counts it once, with the amount asked.
    Billing::InvoiceSettlement.mark_paid(@request.reload, by: @staff)
    payment = BillingPayment.sole
    assert_equal [ @request, @user, "atelier", @request.amount_cents, 0 ],
                 [ payment.invoice_request, payment.user, payment.plan_key, payment.amount_cents, payment.tax_cents ]
    assert_nil payment.stripe_invoice_id
  end

  test "with a Stripe invoice: marked paid out of band in Stripe and recorded like the webhook" do
    with_billing do
      invoiced!
      log = []
      stub_stripe_post("invoices/in_req_1/pay", invoice_request_invoice(@request, amount_paid: 0, paid_out_of_band: true), log:)
      Billing::InvoiceSettlement.mark_paid(@request, by: @staff)
      assert_equal "true", log.sole["paid_out_of_band"]
      assert_equal [ 58_800, "atelier", @request ], BillingPayment.sole.values_at(:amount_cents, :plan_key).push(BillingPayment.sole.invoice_request)
      assert_equal [ "paid", @staff ], [ @request.reload.status, @request.handled_by ]
      assert @request.plan_grant.active?
    end
  end

  test "an invoice paid on Stripe in the meantime is taken as it is" do
    with_billing do
      invoiced!
      stub_request(:post, stripe_api("invoices/in_req_1/pay"))
        .to_return(status: 400, body: { error: { type: "invalid_request_error", message: "Invoice is already paid." } }.to_json, headers: { "Content-Type" => "application/json" })
      stub_stripe_get("invoices/in_req_1", invoice_request_invoice(@request))
      Billing::InvoiceSettlement.mark_paid(@request, by: @staff)
      assert @request.reload.paid?
      assert_equal 1, BillingPayment.count
    end
  end

  test "cancelling voids the open Stripe invoice and stops the plan" do
    with_billing do
      invoiced!
      grant = @request.activate!
      void = stub_stripe_post("invoices/in_req_1/void", invoice_request_invoice(@request, status: "void"))
      Billing::InvoiceSettlement.cancel(@request, by: @staff)
      assert_requested void
      assert @request.reload.cancelled?
      assert grant.reload.revoked?
    end
  end

  test "a refused void leaves the request as it was" do
    with_billing do
      invoiced!
      stub_request(:post, stripe_api("invoices/in_req_1/void"))
        .to_return(status: 400, body: { error: { type: "invalid_request_error", message: "You can only pass in open invoices." } }.to_json, headers: { "Content-Type" => "application/json" })
      assert_raises(Providers::StripeGateway::Error) { Billing::InvoiceSettlement.cancel(@request, by: @staff) }
      assert @request.reload.invoiced?
    end
  end

  test "cancelling a request made by hand needs no Stripe" do
    Billing::InvoiceSettlement.cancel(@request, by: @staff)
    assert @request.reload.cancelled?
    assert_not_requested :post, /api\.stripe\.com/
  end
end
