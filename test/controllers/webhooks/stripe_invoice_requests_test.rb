require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

# invoice.paid and charge.refunded for the invoices sent to communes and
# companies (« Payer sur facture »).
class Webhooks::StripeInvoiceRequestsTest < ActionDispatch::IntegrationTest
  include BillingTestHelper
  include ActionMailer::TestHelper

  setup do
    @user = users(:bob)
    @invoice_request = @user.invoice_requests.create!(organization_name: "Commune de Yvoir", billing_address: "Rue 1\n5530 Yvoir",
                                              billing_email: "compta@yvoir.be", plan_key: "bureau", purchase_order: "BC-42")
    @invoice_request.update!(status: "invoiced", stripe_invoice_id: "in_req_1", invoiced_at: 1.day.ago)
  end

  test "invoice.paid records the payment once, marks the request paid and starts the plan" do
    with_billing do
      invoice = invoice_request_invoice(@invoice_request, tax: 2_062)
      assert_enqueued_email_with InvoicingMailer, :plan_activated, args: ->(args) { args.first.invoice_request == @invoice_request } do
        post_stripe_event(stripe_event("invoice.paid", invoice, id: "evt_paid"))
      end
      assert_response :success

      payment = @user.billing_payments.sole
      assert_equal [ 118_800, 2_062, "eur", "bureau", "in_req_1", @invoice_request ],
        payment.values_at(:amount_cents, :tax_cents, :currency, :plan_key, :stripe_invoice_id).push(payment.invoice_request)
      assert_equal "https://invoice.stripe.com/i/acct/in_req_1", payment.hosted_invoice_url
      assert_nil payment.plan_subscription

      @invoice_request.reload
      assert @invoice_request.paid?
      assert @invoice_request.paid_at
      grant = @invoice_request.plan_grant
      assert grant.active?
      assert_in_delta 12.months.from_now, grant.ends_at, 5
      assert_equal "bureau", @user.reload.current_plan_key

      assert_no_difference [ "BillingPayment.count", "PlanGrant.count" ] do
        post_stripe_event(stripe_event("invoice.paid", invoice, id: "evt_paid"))                # redelivery
        post_stripe_event(stripe_event("invoice.paid", invoice, id: "evt_other"))               # another event, same invoice
      end
      assert_equal 2, StripeEvent.where(event_type: "invoice.paid").processed.count
    end
  end

  test "a plan already started by staff is kept as it is" do
    with_billing do
      grant = @invoice_request.activate!(starts_at: 1.week.ago)
      post_stripe_event(stripe_event("invoice.paid", invoice_request_invoice(@invoice_request)))
      assert_equal grant, @invoice_request.reload.plan_grant
      assert_in_delta 1.week.ago, grant.reload.starts_at, 5
      assert @invoice_request.paid?
    end
  end

  test "the request is found by its invoice id when the metadata is missing" do
    with_billing do
      invoice = invoice_request_invoice(@invoice_request).merge("metadata" => {})
      post_stripe_event(stripe_event("invoice.paid", invoice))
      assert_equal @invoice_request, BillingPayment.sole.invoice_request
    end
  end

  test "an invoice marked paid outside Stripe is recorded at its total" do
    with_billing do
      post_stripe_event(stripe_event("invoice.paid", invoice_request_invoice(@invoice_request, amount_paid: 0, paid_out_of_band: true)))
      assert_equal 118_800, BillingPayment.sole.amount_cents
    end
  end

  test "subscription invoices are still recorded as before" do
    with_billing do
      post_stripe_event(stripe_event("customer.subscription.created", subscription_object(user: @user)))
      post_stripe_event(stripe_event("invoice.paid", invoice_object(id: "in_sub")))
      assert_equal [ "atelier", nil ], BillingPayment.find_by!(stripe_invoice_id: "in_sub").values_at(:plan_key, :invoice_request_id)
      assert_not @invoice_request.reload.paid?
    end
  end

  test "a full refund of the invoice ends the plan, a partial one keeps it" do
    with_billing do
      post_stripe_event(stripe_event("invoice.paid", invoice_request_invoice(@invoice_request)))
      post_stripe_event(stripe_event("charge.refunded", { "id" => "ch_1", "invoice" => "in_req_1", "amount" => 118_800, "amount_refunded" => 50_000 }))
      assert_equal "bureau", @user.reload.current_plan_key
      post_stripe_event(stripe_event("charge.refunded", { "id" => "ch_1", "invoice" => "in_req_1", "amount" => 118_800, "amount_refunded" => 118_800 }))
      assert_equal 118_800, BillingPayment.sole.refunded_cents
      assert @invoice_request.reload.plan_grant.revoked?
      assert_equal "free", @user.reload.current_plan_key
    end
  end
end
