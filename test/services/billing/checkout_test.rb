require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Billing::CheckoutTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup do
    @user = users(:bob)
    @customer_stub = stub_request(:post, stripe_api("customers"))
      .to_return(body: { id: "cus_new" }.to_json, headers: { "Content-Type" => "application/json" })
    @requests = []
    stub_request(:post, stripe_api("checkout/sessions")).to_return do |request|
      @requests << Rack::Utils.parse_nested_query(request.body)
      { body: { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }.to_json, headers: { "Content-Type" => "application/json" } }
    end
  end

  def call(plan_key, **options)
    Billing::Checkout.call(user: @user, plan_key:, success_url: "https://designer.test/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://designer.test/billing?checkout=cancelled", terms_url: "https://designer.test/conditions", **options)
  end

  test "creates a yearly pass session: one-off payment, Stripe Tax, promotion codes, automatic invoice" do
    with_billing do
      assert_equal "https://checkout.stripe.com/c/pay/cs_test_1", call("yearly")
      params = @requests.sole
      assert_equal "payment", params["mode"]
      assert_equal "price_yearly", params.dig("line_items", "0", "price")
      assert_equal "1", params.dig("line_items", "0", "quantity")
      assert_equal "true", params.dig("automatic_tax", "enabled")
      assert_equal "true", params["allow_promotion_codes"]
      assert_equal "true", params.dig("invoice_creation", "enabled")
      assert_equal "true", params.dig("tax_id_collection", "enabled")
      assert_equal "cus_new", params["customer"]
      assert_equal "auto", params.dig("customer_update", "address")
      assert_equal @user.id.to_s, params["client_reference_id"]
      assert_equal({ "user_id" => @user.id.to_s, "plan_key" => "yearly" }, params["metadata"])
      assert_equal @user.id.to_s, params.dig("invoice_creation", "invoice_data", "metadata", "user_id")
      assert_equal "https://designer.test/billing?checkout=cancelled", params["cancel_url"]
      assert_includes params["success_url"], "{CHECKOUT_SESSION_ID}"
      assert_includes params.dig("custom_text", "submit", "message"), "https://designer.test/conditions"
      assert_equal "fr", params["locale"]
      assert_nil params["subscription_data"]
      assert_nil params["customer_email"]
    end
  end

  test "subscriptions use subscription mode and carry the user in the subscription metadata" do
    with_billing do
      call("atelier")
      params = @requests.sole
      assert_equal "subscription", params["mode"]
      assert_equal "price_atelier", params.dig("line_items", "0", "price")
      assert_equal "atelier", params.dig("subscription_data", "metadata", "plan_key")
      assert_equal "true", params["allow_promotion_codes"]
      assert_nil params["invoice_creation"]
    end
  end

  test "Pro and Team can be paid yearly; until the end of 2026 the launch coupon replaces the promotion code field" do
    with_billing do
      travel_to Time.zone.local(2026, 12, 31, 22) do
        call("atelier", interval: "year")
        params = @requests.last
        assert_equal "price_atelier_yearly", params.dig("line_items", "0", "price")
        assert_equal "coupon_launch", params.dig("discounts", "0", "coupon")
        assert_nil params["allow_promotion_codes"]
        assert_equal "year", params.dig("metadata", "interval")
      end
      travel_to(Time.zone.local(2027, 1, 1, 0, 30)) { call("bureau", interval: "year") }
      assert_equal "price_bureau_yearly", @requests.last.dig("line_items", "0", "price")
      assert_nil @requests.last["discounts"]
      assert_equal "true", @requests.last["allow_promotion_codes"]
      call("bureau", interval: "month")
      assert_equal "price_bureau", @requests.last.dig("line_items", "0", "price")
      assert_nil @requests.last["discounts"]
    end
  end

  test "a Semisto member in good standing gets the member coupon on Home only" do
    with_billing("SEMISTO_MEMBERSHIP_API_TOKEN" => "standing-token") do
      standing = stub_request(:post, "https://app.semisto.org/api/v1/asbl/standing")
        .with(body: { email: "bob@example.org" }.to_json, headers: { "Authorization" => "Bearer standing-token" })
        .to_return(body: { in_good_standing: true, paid_through: "2026-12-31" }.to_json)
      call("yearly")
      assert_equal "coupon_member", @requests.last.dig("discounts", "0", "coupon")
      assert_nil @requests.last["allow_promotion_codes"]
      call("atelier")
      assert_nil @requests.last["discounts"]
      assert_requested standing
    end
  end

  test "no member price when the internal app says no or cannot be reached" do
    with_billing("SEMISTO_MEMBERSHIP_API_TOKEN" => "standing-token") do
      stub_request(:post, "https://app.semisto.org/api/v1/asbl/standing").to_return(body: { in_good_standing: false, paid_through: nil }.to_json)
      call("yearly")
      assert_equal "true", @requests.last["allow_promotion_codes"]
      Rails.cache.clear
      stub_request(:post, "https://app.semisto.org/api/v1/asbl/standing").to_timeout
      call("yearly")
      assert_nil @requests.last["discounts"]
    end
  end

  test "the VAT number from « Mon compte » goes on the Stripe customer, and an address is always asked" do
    @user.update!(vat_number: "0790.631.657")
    with_billing do
      stub_request(:get, stripe_api("customers/cus_new/tax_ids?limit=100")).to_return(body: { data: [] }.to_json, headers: { "Content-Type" => "application/json" })
      tax_ids = []
      stub_stripe_post("customers/cus_new/tax_ids", { id: "txi_1" }, log: tax_ids)
      call("atelier")
      assert_equal [ { "type" => "eu_vat", "value" => "BE0790631657" } ], tax_ids
      assert_equal "required", @requests.last["billing_address_collection"]
    end
  end

  test "the drone mission is a one-off payment" do
    with_billing do
      call("drone")
      assert_equal %w[payment price_drone], [ @requests.sole["mode"], @requests.sole.dig("line_items", "0", "price") ]
    end
  end

  test "creates the Stripe customer once and reuses it" do
    with_billing do
      call("yearly")
      call("bureau")
      assert_requested @customer_stub, times: 1
      assert_equal "cus_new", @user.reload.billing_account.stripe_customer_id
      assert_equal %w[cus_new cus_new], @requests.map { |r| r["customer"] }
    end
  end

  test "creates a new customer when the saved one is unknown to Stripe (test keys replaced by live keys)" do
    with_billing do
      @user.create_billing_account!(stripe_customer_id: "cus_from_test_mode")
      calls = 0
      stub_request(:post, stripe_api("checkout/sessions")).to_return do |request|
        calls += 1
        if calls == 1
          { status: 400, body: { error: { type: "invalid_request_error", message: "No such customer: 'cus_from_test_mode'" } }.to_json, headers: { "Content-Type" => "application/json" } }
        else
          @requests << Rack::Utils.parse_nested_query(request.body)
          { body: { id: "cs_2", url: "https://checkout.stripe.com/c/pay/cs_2" }.to_json, headers: { "Content-Type" => "application/json" } }
        end
      end
      assert_equal "https://checkout.stripe.com/c/pay/cs_2", call("yearly")
      assert_equal "cus_new", @user.reload.billing_account.stripe_customer_id
    end
  end

  test "does nothing when billing is not configured" do
    error = assert_raises(Billing::Checkout::Unavailable) { call("yearly") }
    assert_equal :not_configured, error.reason
    assert_not_requested :post, stripe_api("checkout/sessions")
  end

  test "refuses unknown plans, the free plan and plans without a Stripe price" do
    with_billing("STRIPE_PRICE_ATELIER" => nil) do
      assert_equal :unknown_plan, assert_raises(Billing::Checkout::Unavailable) { call("nope") }.reason
      assert_equal :unknown_plan, assert_raises(Billing::Checkout::Unavailable) { call("free") }.reason
      assert_equal :price_missing, assert_raises(Billing::Checkout::Unavailable) { call("atelier") }.reason
    end
  end

  test "a subscriber changes plan in the customer portal, not with a second subscription" do
    with_billing do
      @user.plan_subscriptions.create!(plan_key: "atelier", status: "active", stripe_subscription_id: "sub_1")
      assert_equal :manage_in_portal, assert_raises(Billing::Checkout::Unavailable) { call("bureau") }.reason
      assert call("yearly")
    end
  end

  test "Stripe failures become a gateway error" do
    with_billing do
      stub_request(:post, stripe_api("checkout/sessions")).to_return(status: 500, body: { error: { message: "boom" } }.to_json, headers: { "Content-Type" => "application/json" })
      assert_raises(Providers::StripeGateway::Error) { call("yearly") }
    end
  end

  test "portal session needs a Stripe customer" do
    with_billing do
      assert_raises(Billing::Portal::Unavailable) { Billing::Portal.url(user: @user, return_url: "https://designer.test/billing") }
      @user.create_billing_account!(stripe_customer_id: "cus_9")
      body = nil
      stub_request(:post, stripe_api("billing_portal/sessions")).to_return do |request|
        body = Rack::Utils.parse_nested_query(request.body)
        { body: { url: "https://billing.stripe.com/p/session/x" }.to_json, headers: { "Content-Type" => "application/json" } }
      end
      assert_equal "https://billing.stripe.com/p/session/x", Billing::Portal.url(user: @user, return_url: "https://designer.test/billing")
      assert_equal %w[cus_9 https://designer.test/billing], body.values_at("customer", "return_url")
    end
  end
end
