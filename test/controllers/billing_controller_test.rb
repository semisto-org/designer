require "test_helper"
require_relative "../test_helpers/billing_test_helper"

class BillingControllerTest < ActionDispatch::IntegrationTest
  include BillingTestHelper

  setup { @user = users(:bob) }

  def billing_props
    get "/billing", headers: inertia_headers
    assert_response :success
    response.parsed_body["props"]["billing"]
  end

  test "requires sign in and comes back after it" do
    get "/billing", params: { plan: "yearly" }
    assert_redirected_to new_session_path
  end

  test "free plan: no pass, nothing to manage" do
    sign_in_as @user
    props = billing_props
    assert_equal "free", props["plan"]
    assert_nil props["pass"]
    assert_equal false, props["canManage"]
    assert_equal false, props["enabled"]
    assert_equal 5_530, props["memberPriceCents"]
  end

  test "shows the yearly pass, its expiry and the days left" do
    @user.plan_purchases.create!(plan_key: "yearly", starts_at: 5.months.ago, expires_at: 100.days.from_now, stripe_checkout_session_id: "cs_1")
    sign_in_as @user
    with_billing do
      props = billing_props
      assert_equal "yearly", props["plan"]
      assert_in_delta 100, props["pass"]["daysLeft"], 1
      assert_nil props["expiredPass"]
      assert props["enabled"]
    end
  end

  test "an expired pass is shown with the number of maps that became read-only" do
    @user.plan_purchases.create!(plan_key: "yearly", starts_at: 13.months.ago, expires_at: 1.month.ago, stripe_checkout_session_id: "cs_1")
    2.times { |i| Map.create!(name: "Carte #{i}", owner: @user, region: regions(:wallonia)) }
    sign_in_as @user
    with_billing do
      props = billing_props
      assert_equal "free", props["plan"]
      assert_nil props["pass"]
      assert props["expiredPass"]
      assert_equal 1, props["readOnlyMaps"]
      assert_equal [ 2, 1 ], [ props["ownedMaps"], props["maxMaps"] ]
    end
  end

  test "shows the subscription, a pending cancellation and a payment problem" do
    @user.plan_subscriptions.create!(plan_key: "bureau", status: "past_due", past_due_since: 1.day.ago, cancel_at_period_end: true,
      current_period_end: 20.days.from_now, stripe_subscription_id: "sub_1")
    sign_in_as @user
    with_billing do
      props = billing_props
      assert_equal "bureau", props["plan"]
      assert_equal %w[bureau past_due], props["subscription"].values_at("planKey", "status")
      assert props["subscription"]["pastDue"] && props["subscription"]["cancelAtPeriodEnd"]
    end
  end

  test "lists recent payments with their invoice link, newest first" do
    @user.billing_payments.create!(plan_key: "yearly", amount_cents: 7_900, paid_at: 2.days.ago, hosted_invoice_url: "https://invoice.stripe.com/i/1")
    @user.billing_payments.create!(plan_key: "drone", amount_cents: 28_000, paid_at: 1.day.ago)
    sign_in_as @user
    payments = billing_props["payments"]
    assert_equal %w[drone yearly], payments.map { |p| p["planKey"] }
    assert_equal "https://invoice.stripe.com/i/1", payments.last["invoiceUrl"]
  end

  test "highlights the plan chosen on the pricing page and reports the Checkout result" do
    sign_in_as @user
    get "/billing", params: { plan: "atelier", checkout: "cancelled" }, headers: inertia_headers
    props = response.parsed_body["props"]["billing"]
    assert_equal %w[atelier cancelled], props.values_at("highlight", "checkout")
    get "/billing", params: { plan: "nope", checkout: "<script>" }, headers: inertia_headers
    props = response.parsed_body["props"]["billing"]
    assert_nil props["highlight"]
    assert_nil props["checkout"]
  end

  test "coming back from Checkout fulfils the purchase without waiting for the webhook" do
    sign_in_as @user
    with_billing do
      session = checkout_session(user: @user, id: "cs_return")
      stub = stub_stripe_get("checkout/sessions/cs_return", session)
      get "/billing", params: { checkout: "success", session_id: "cs_return" }, headers: inertia_headers
      assert_requested stub
      assert_equal "yearly", response.parsed_body["props"]["billing"]["plan"]
      assert_equal 1, @user.plan_purchases.count

      get "/billing", params: { checkout: "success", session_id: "cs_return" }, headers: inertia_headers   # reload: still one
      assert_equal 1, @user.plan_purchases.count
    end
  end

  test "someone else's Checkout session id grants nothing" do
    sign_in_as @user
    with_billing do
      stub_stripe_get("checkout/sessions/cs_other", checkout_session(user: users(:alice), id: "cs_other"))
      get "/billing", params: { session_id: "cs_other" }, headers: inertia_headers
      assert_response :success
      assert_equal 0, PlanPurchase.count
    end
  end

  test "the page still renders when Stripe is unreachable on return from Checkout" do
    sign_in_as @user
    with_billing do
      stub_stripe_get("checkout/sessions/cs_x", { "error" => { "message" => "down" } }, status: 500)
      get "/billing", params: { session_id: "cs_x" }, headers: inertia_headers
      assert_response :success
    end
  end

  # --- checkout and portal endpoints ---

  test "POST /billing/checkout sends an Inertia visit to Stripe" do
    sign_in_as @user
    with_billing do
      stub_request(:post, stripe_api("customers")).to_return(body: { id: "cus_1" }.to_json, headers: { "Content-Type" => "application/json" })
      stub_request(:post, stripe_api("checkout/sessions")).to_return(body: { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }.to_json, headers: { "Content-Type" => "application/json" })
      post "/billing/checkout", params: { plan: "yearly" }, headers: inertia_headers
      assert_response :conflict
      assert_equal "https://checkout.stripe.com/c/pay/cs_1", response.headers["X-Inertia-Location"]
    end
  end

  test "POST /billing/checkout redirects a plain form post" do
    sign_in_as @user
    with_billing do
      stub_request(:post, stripe_api("customers")).to_return(body: { id: "cus_1" }.to_json, headers: { "Content-Type" => "application/json" })
      stub_request(:post, stripe_api("checkout/sessions")).to_return(body: { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }.to_json, headers: { "Content-Type" => "application/json" })
      post "/billing/checkout", params: { plan: "drone" }
      assert_redirected_to "https://checkout.stripe.com/c/pay/cs_1"
    end
  end

  test "POST /billing/checkout explains in French when billing is not open or Stripe fails" do
    sign_in_as @user
    post "/billing/checkout", params: { plan: "yearly" }
    assert_redirected_to billing_path
    assert_match "pas encore ouverts", flash[:alert]

    with_billing do
      stub_request(:post, stripe_api("customers")).to_return(status: 500, body: { error: { message: "down" } }.to_json, headers: { "Content-Type" => "application/json" })
      post "/billing/checkout", params: { plan: "yearly" }
      assert_redirected_to billing_path
      assert_match "momentanément indisponible", flash[:alert]
    end
  end

  test "POST /billing/checkout requires sign in" do
    post "/billing/checkout", params: { plan: "yearly" }
    assert_redirected_to new_session_path
  end

  test "POST /billing/portal opens the customer portal" do
    @user.create_billing_account!(stripe_customer_id: "cus_7")
    sign_in_as @user
    with_billing do
      stub_request(:post, stripe_api("billing_portal/sessions")).to_return(body: { url: "https://billing.stripe.com/p/session/abc" }.to_json, headers: { "Content-Type" => "application/json" })
      post "/billing/portal", headers: inertia_headers
      assert_response :conflict
      assert_equal "https://billing.stripe.com/p/session/abc", response.headers["X-Inertia-Location"]
    end
  end

  test "POST /billing/portal without a Stripe customer goes back to the billing page" do
    sign_in_as @user
    with_billing do
      post "/billing/portal"
      assert_redirected_to billing_path
      assert_match "premier paiement", flash[:alert]
    end
  end
end
