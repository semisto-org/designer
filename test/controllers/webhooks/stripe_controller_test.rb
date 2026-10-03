require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Webhooks::StripeControllerTest < ActionDispatch::IntegrationTest
  include BillingTestHelper
  include ActionMailer::TestHelper

  setup { @user = users(:bob) }

  # --- signature ---

  test "rejects an unsigned request" do
    with_billing do
      post "/webhooks/stripe", params: "{}", headers: { "CONTENT_TYPE" => "application/json" }
      assert_response :bad_request
    end
  end

  test "rejects a wrong signature and stores nothing" do
    with_billing do
      event = stripe_event("checkout.session.completed", checkout_session(user: @user))
      assert_no_difference [ "StripeEvent.count", "PlanPurchase.count" ] do
        post_stripe_event(event, signature: stripe_signature(event.to_json, secret: "whsec_other"))
      end
      assert_response :bad_request
    end
  end

  test "rejects a signature that is too old" do
    with_billing do
      event = stripe_event("checkout.session.completed", checkout_session(user: @user))
      post_stripe_event(event, signature: stripe_signature(event.to_json, at: 10.minutes.ago))
      assert_response :bad_request
    end
  end

  test "rejects a body that is not an event" do
    with_billing do
      post_stripe_event({ "hello" => "world" })
      assert_response :bad_request
    end
  end

  test "answers 503 when the webhook secret is not configured, so Stripe retries" do
    with_billing("STRIPE_WEBHOOK_SECRET" => nil) do
      post "/webhooks/stripe", params: "{}", headers: { "CONTENT_TYPE" => "application/json", "Stripe-Signature" => "t=1,v1=x" }
      assert_response :service_unavailable
    end
  end

  test "needs no session and no CSRF token" do
    with_billing do
      post_stripe_event(stripe_event("customer.created", { "id" => "cus_1" }))
      assert_response :success
    end
  end

  # --- checkout: yearly pass and drone ---

  test "a paid yearly checkout creates the pass, the payment and the plan" do
    with_billing do
      session = checkout_session(user: @user, amount_total: 7_900, amount_tax: 1_371)
      post_stripe_event(stripe_event("checkout.session.completed", session))
      assert_response :success

      purchase = @user.plan_purchases.sole
      assert_equal "yearly", purchase.plan_key
      assert_in_delta 1.year.from_now, purchase.expires_at, 5
      assert_equal "yearly", @user.current_plan_key

      payment = @user.billing_payments.sole
      assert_equal [ 7_900, 1_371, 0, "eur", "yearly", nil ], payment.values_at(:amount_cents, :tax_cents, :discount_cents, :currency, :plan_key, :promotion_code)
      assert_equal 6_529, payment.net_cents
      assert_equal purchase, payment.plan_purchase
      assert_equal "cus_123", @user.billing_account.stripe_customer_id
    end
  end

  test "is idempotent: the same event delivered twice changes nothing" do
    with_billing do
      event = stripe_event("checkout.session.completed", checkout_session(user: @user), id: "evt_same")
      post_stripe_event(event)
      assert_no_difference [ "StripeEvent.count", "PlanPurchase.count", "BillingPayment.count" ] do
        post_stripe_event(event)
      end
      assert_response :success
      assert_equal "duplicate", response.parsed_body["status"]
      assert_equal 1, StripeEvent.where(stripe_event_id: "evt_same").processed.count
    end
  end

  test "a different event for the same Checkout session does not grant a second pass" do
    with_billing do
      session = checkout_session(user: @user)
      post_stripe_event(stripe_event("checkout.session.completed", session))
      assert_no_difference [ "PlanPurchase.count", "BillingPayment.count" ] do
        post_stripe_event(stripe_event("checkout.session.async_payment_succeeded", session))
      end
    end
  end

  test "renewing before expiry starts the new year when the current one ends" do
    with_billing do
      current = @user.plan_purchases.create!(plan_key: "yearly", starts_at: 10.months.ago, expires_at: 2.months.from_now, stripe_checkout_session_id: "cs_old")
      post_stripe_event(stripe_event("checkout.session.completed", checkout_session(user: @user)))
      renewed = @user.plan_purchases.order(:id).last
      assert_in_delta current.expires_at, renewed.starts_at, 1
      assert_in_delta current.expires_at + 1.year, renewed.expires_at, 1
    end
  end

  test "records the promotion code used (looked up in Stripe)" do
    with_billing do
      session = checkout_session(user: @user, amount_total: 5_530, amount_tax: 960, amount_discount: 2_370)
      session["discounts"] = [ { "coupon" => "co_member", "promotion_code" => "promo_abc" } ]
      stub = stub_stripe_get("promotion_codes/promo_abc", { "id" => "promo_abc", "code" => "MEMBRE-DUPONT" })
      post_stripe_event(stripe_event("checkout.session.completed", session))
      assert_requested stub
      payment = @user.billing_payments.sole
      assert_equal "MEMBRE-DUPONT", payment.promotion_code
      assert_equal [ 5_530, 2_370 ], [ payment.amount_cents, payment.discount_cents ]
    end
  end

  test "finds the promotion code in the expanded discount breakdown when the session lists none" do
    with_billing do
      session = checkout_session(user: @user, amount_total: 5_530, amount_discount: 2_370, id: "cs_promo")
      expanded = session.merge("total_details" => session["total_details"].merge(
        "breakdown" => { "discounts" => [ { "amount" => 2_370, "discount" => { "promotion_code" => { "id" => "promo_x", "code" => "MEMBRE-MARTIN" } } } ] }
      ))
      stub = stub_stripe_get("checkout/sessions/cs_promo", expanded)
      post_stripe_event(stripe_event("checkout.session.completed", session))
      assert_requested stub
      assert_equal "MEMBRE-MARTIN", @user.billing_payments.sole.promotion_code
    end
  end

  test "a failed Stripe lookup fails the event so Stripe redelivers it, then it succeeds" do
    with_billing do
      session = checkout_session(user: @user, amount_total: 5_530, amount_discount: 2_370, discounts: [ { "promotion_code" => "promo_abc" } ])
      event = stripe_event("checkout.session.completed", session, id: "evt_retry")
      stub_stripe_get("promotion_codes/promo_abc", { "error" => { "message" => "boom" } }, status: 500)
      post_stripe_event(event)
      assert_response :internal_server_error
      stored = StripeEvent.find_by!(stripe_event_id: "evt_retry")
      assert_nil stored.processed_at
      assert_match(/StripeGateway::Error/, stored.error)
      assert_equal 0, PlanPurchase.count

      WebMock.reset!
      stub_stripe_get("promotion_codes/promo_abc", { "id" => "promo_abc", "code" => "MEMBRE-1" })
      post_stripe_event(event)
      assert_response :success
      assert_equal "MEMBRE-1", @user.billing_payments.sole.promotion_code
      assert stored.reload.processed?
      assert_nil stored.error
    end
  end

  test "a drone order records the payment and notifies Semisto without giving a plan" do
    with_billing do
      session = checkout_session(user: @user, plan_key: "drone", amount_total: 28_000, amount_tax: 4_860)
      assert_enqueued_emails 1 do
        post_stripe_event(stripe_event("checkout.session.completed", session))
      end
      assert_equal "free", @user.current_plan_key
      assert_equal "drone", @user.billing_payments.sole.plan_key
      perform_enqueued_jobs
      mail = ActionMailer::Base.deliveries.last
      assert_equal [ Billing.contact_email ], mail.to
      assert_equal [ @user.email_address ], mail.reply_to
      assert_match "280", mail.text_part.body.to_s
    end
  end

  test "an unpaid session grants nothing" do
    with_billing do
      post_stripe_event(stripe_event("checkout.session.completed", checkout_session(user: @user).merge("payment_status" => "unpaid")))
      assert_response :success
      assert_equal 0, PlanPurchase.count
    end
  end

  test "an event for an unknown user is stored and acknowledged" do
    with_billing do
      session = checkout_session(user: @user)
      session["client_reference_id"] = "999999"
      session["metadata"]["user_id"] = "999999"
      session["customer"] = "cus_unknown"
      post_stripe_event(stripe_event("checkout.session.completed", session))
      assert_response :success
      assert_equal "unknown user", StripeEvent.last.note
    end
  end

  test "unknown event types are stored and ignored" do
    with_billing do
      assert_difference "StripeEvent.count" do
        post_stripe_event(stripe_event("customer.created", { "id" => "cus_9" }))
      end
      assert_equal "ignored event type", StripeEvent.last.note
    end
  end

  # --- subscriptions ---

  test "checkout of a subscription syncs it from Stripe" do
    with_billing do
      stub_stripe_get("subscriptions/sub_123", subscription_object(user: @user))
      post_stripe_event(stripe_event("checkout.session.completed", checkout_session(user: @user, mode: "subscription", plan_key: "atelier", subscription: "sub_123")))
      subscription = @user.plan_subscriptions.sole
      assert_equal %w[atelier active], [ subscription.plan_key, subscription.status ]
      assert_equal "atelier", @user.current_plan_key
      assert_equal 0, PlanPurchase.count
    end
  end

  test "subscription events keep the mirror up to date, including plan changes and cancellation" do
    with_billing do
      post_stripe_event(stripe_event("customer.subscription.created", subscription_object(user: @user), created: 100.seconds.ago.to_i))
      assert_equal "atelier", @user.current_plan_key

      post_stripe_event(stripe_event("customer.subscription.updated", subscription_object(user: @user, price: "price_bureau", cancel_at_period_end: true), created: 50.seconds.ago.to_i))
      subscription = @user.plan_subscriptions.sole
      assert_equal "bureau", subscription.plan_key
      assert subscription.cancel_at_period_end
      assert_equal "bureau", @user.current_plan_key

      post_stripe_event(stripe_event("customer.subscription.deleted", subscription_object(user: @user, price: "price_bureau", status: "canceled"), created: 10.seconds.ago.to_i))
      assert_equal "canceled", subscription.reload.status
      assert_equal "free", @user.current_plan_key
    end
  end

  test "an older event delivered late never overwrites newer state" do
    with_billing do
      post_stripe_event(stripe_event("customer.subscription.updated", subscription_object(user: @user, status: "active"), created: 10.seconds.ago.to_i))
      post_stripe_event(stripe_event("customer.subscription.updated", subscription_object(user: @user, status: "past_due"), created: 60.seconds.ago.to_i))
      assert_equal "active", @user.plan_subscriptions.sole.status
    end
  end

  test "past due starts the grace period once, and recovery clears it" do
    with_billing do
      post_stripe_event(stripe_event("customer.subscription.updated", subscription_object(user: @user, status: "past_due"), created: 3.days.ago.to_i))
      post_stripe_event(stripe_event("customer.subscription.updated", subscription_object(user: @user, status: "past_due"), created: 1.day.ago.to_i))
      subscription = @user.plan_subscriptions.sole
      assert_in_delta 3.days.ago, subscription.past_due_since, 5
      assert_equal "atelier", @user.current_plan_key
      post_stripe_event(stripe_event("customer.subscription.updated", subscription_object(user: @user, status: "active"), created: 10.seconds.ago.to_i))
      assert_nil subscription.reload.past_due_since
    end
  end

  test "a subscription without our metadata is found through the Stripe customer" do
    with_billing do
      @user.create_billing_account!(stripe_customer_id: "cus_known")
      sub = subscription_object(user: @user, customer: "cus_known", metadata: {})
      post_stripe_event(stripe_event("customer.subscription.created", sub))
      assert_equal @user, PlanSubscription.sole.user
    end
  end

  test "an unknown price is ignored" do
    with_billing do
      post_stripe_event(stripe_event("customer.subscription.created", subscription_object(user: @user, price: "price_other", metadata: {})))
      assert_equal 0, PlanSubscription.count
    end
  end

  test "invoice.paid records every subscription payment with amount, tax, currency and plan" do
    with_billing do
      post_stripe_event(stripe_event("customer.subscription.created", subscription_object(user: @user)))
      post_stripe_event(stripe_event("invoice.paid", invoice_object(id: "in_1")))
      post_stripe_event(stripe_event("invoice.paid", invoice_object(id: "in_2", amount_paid: 4_900)))
      post_stripe_event(stripe_event("invoice.paid", invoice_object(id: "in_2")))   # same invoice, other event id
      assert_equal 2, @user.billing_payments.count
      payment = @user.billing_payments.find_by!(stripe_invoice_id: "in_1")
      assert_equal [ 4_900, 850, "eur", "atelier" ], payment.values_at(:amount_cents, :tax_cents, :currency, :plan_key)
      assert_equal "https://invoice.stripe.com/i/acct/in_123", payment.hosted_invoice_url
      assert_equal @user.plan_subscriptions.sole, payment.plan_subscription
    end
  end

  test "invoice.paid still reads the older invoice shape (subscription and tax at the top level)" do
    with_billing do
      post_stripe_event(stripe_event("customer.subscription.created", subscription_object(user: @user)))
      invoice = invoice_object(id: "in_old").except("parent", "total_taxes").merge("subscription" => "sub_123", "tax" => 850)
      post_stripe_event(stripe_event("invoice.paid", invoice))
      assert_equal [ 4_900, 850 ], @user.billing_payments.sole.values_at(:amount_cents, :tax_cents)
    end
  end

  test "invoice.paid for a subscription we have not seen fetches it from Stripe" do
    with_billing do
      stub = stub_stripe_get("subscriptions/sub_123", subscription_object(user: @user))
      post_stripe_event(stripe_event("invoice.paid", invoice_object))
      assert_requested stub
      assert_equal 1, @user.billing_payments.count
      assert_equal "atelier", @user.current_plan_key
    end
  end

  test "invoice.paid resolves the promotion code of a discounted invoice" do
    with_billing do
      post_stripe_event(stripe_event("customer.subscription.created", subscription_object(user: @user)))
      stub_stripe_get("invoices/in_disc", { "id" => "in_disc", "discounts" => [ { "id" => "di_1", "promotion_code" => "promo_pro" } ] })
      stub_stripe_get("promotion_codes/promo_pro", { "id" => "promo_pro", "code" => "PRO-LANCEMENT" })
      post_stripe_event(stripe_event("invoice.paid", invoice_object(id: "in_disc", discounts: [ "di_1" ])))
      assert_equal "PRO-LANCEMENT", @user.billing_payments.sole.promotion_code
    end
  end

  test "the invoice of a one-off Checkout payment is linked to its payment" do
    with_billing do
      post_stripe_event(stripe_event("checkout.session.completed", checkout_session(user: @user)))
      invoice = invoice_object(id: "in_oneoff", subscription: nil, amount_paid: 7_900)
      post_stripe_event(stripe_event("invoice.paid", invoice))
      payment = @user.billing_payments.sole
      assert_equal "in_oneoff", payment.stripe_invoice_id
      assert_match "invoice.stripe.com", payment.hosted_invoice_url
    end
  end

  test "an invoice that arrives before its Checkout payment is retried, then given up on" do
    with_billing do
      post_stripe_event(stripe_event("invoice.paid", invoice_object(id: "in_early", subscription: nil, amount_paid: 7_900)))
      assert_response :internal_server_error
      manual = stripe_event("invoice.paid", invoice_object(id: "in_manual", subscription: nil, amount_paid: 1_000), created: 1.hour.ago.to_i)
      post_stripe_event(manual)
      assert_response :success
      assert_equal "invoice without matching payment", StripeEvent.find_by!(stripe_event_id: manual["id"]).note
    end
  end

  # --- refunds ---

  test "a full refund records it and ends the yearly pass" do
    with_billing do
      session = checkout_session(user: @user, id: "cs_refund")
      post_stripe_event(stripe_event("checkout.session.completed", session))
      assert_equal "yearly", @user.current_plan_key

      charge = { "id" => "ch_1", "payment_intent" => "pi_cs_refund", "amount" => 7_900, "amount_refunded" => 7_900, "refunded" => true }
      post_stripe_event(stripe_event("charge.refunded", charge))
      payment = @user.billing_payments.sole
      assert_equal 7_900, payment.refunded_cents
      assert payment.refunded_at
      assert_equal "refunded", @user.plan_purchases.sole.status
      assert_equal "free", @user.current_plan_key
    end
  end

  test "a partial refund keeps the pass" do
    with_billing do
      post_stripe_event(stripe_event("checkout.session.completed", checkout_session(user: @user, id: "cs_part")))
      post_stripe_event(stripe_event("charge.refunded", { "id" => "ch_2", "payment_intent" => "pi_cs_part", "amount" => 7_900, "amount_refunded" => 2_000 }))
      assert_equal 2_000, @user.billing_payments.sole.refunded_cents
      assert_equal "yearly", @user.current_plan_key
    end
  end

  test "a refund of a subscription payment is matched through its invoice" do
    with_billing do
      post_stripe_event(stripe_event("customer.subscription.created", subscription_object(user: @user)))
      post_stripe_event(stripe_event("invoice.paid", invoice_object(id: "in_ref")))
      stub_request(:get, %r{\Ahttps://api\.stripe\.com/v1/invoice_payments})
        .to_return(body: { "object" => "list", "data" => [ { "id" => "inpay_1", "invoice" => "in_ref" } ] }.to_json, headers: { "Content-Type" => "application/json" })
      post_stripe_event(stripe_event("charge.refunded", { "id" => "ch_3", "payment_intent" => "pi_sub", "amount" => 4_900, "amount_refunded" => 4_900 }))
      assert_equal 4_900, @user.billing_payments.sole.refunded_cents
      assert_equal "pi_sub", @user.billing_payments.sole.stripe_payment_intent_id
    end
  end

  test "a refund we cannot match is stored and acknowledged" do
    with_billing do
      stub_request(:get, %r{\Ahttps://api\.stripe\.com/v1/invoice_payments})
        .to_return(body: { "object" => "list", "data" => [] }.to_json, headers: { "Content-Type" => "application/json" })
      post_stripe_event(stripe_event("charge.refunded", { "id" => "ch_x", "payment_intent" => "pi_x", "amount" => 100, "amount_refunded" => 100 }))
      assert_response :success
      assert_equal "refunded payment not found", StripeEvent.last.note
    end
  end
end
