require "test_helper"
require_relative "../../test_helpers/billing_test_helper"

class Admin::PromoCodesControllerTest < ActionDispatch::IntegrationTest
  include BillingTestHelper

  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    # The page lists the codes after every redirect; tests that care stub it again.
    stub_stripe_get("promotion_codes", { "object" => "list", "has_more" => false, "data" => [] })
  end

  def props
    response.parsed_body["props"]
  end

  def valid_params(**overrides)
    { promo_code: { code: "beta-k7qx", discount_type: "percent", percent_off: "100", amount_off: "", duration: "repeating",
                    duration_in_months: "3", plan_keys: %w[yearly atelier bureau], max_redemptions: "20",
                    expires_on: "2026-12-31", first_time_only: "1", note: "Bêta testeurs automne 2026" }.merge(overrides) }
  end

  def promotion_code(id: "promo_1", code: "BETA-K7QX", active: true, coupon: nil, metadata: {})
    { "id" => id, "object" => "promotion_code", "code" => code, "active" => active, "times_redeemed" => 2, "max_redemptions" => 20,
      "expires_at" => Time.zone.parse("2026-12-31 23:59:59").to_i, "created" => Time.zone.parse("2026-10-18 10:00").to_i,
      "restrictions" => { "first_time_transaction" => true }, "metadata" => metadata,
      "promotion" => { "type" => "coupon", "coupon" => coupon || {
        "id" => "co_1", "percent_off" => 100.0, "amount_off" => nil, "currency" => nil, "duration" => "repeating", "duration_in_months" => 3,
        "metadata" => { "note" => "Bêta testeurs automne 2026", "plan_keys" => "yearly,atelier", "created_by" => "staff@example.org" }
      } } }
  end

  def stub_prices
    { "price_yearly" => "prod_home", "price_atelier" => "prod_pro", "price_bureau" => "prod_team", "price_drone" => "prod_drone" }.each do |price, product|
      stub_stripe_get("prices/#{price}", { "id" => price, "object" => "price", "product" => product })
    end
  end

  test "requires sign in" do
    get admin_promo_codes_path
    assert_redirected_to new_session_path
  end

  test "regular users get a 404 on the page and on every action" do
    sign_in_as users(:michael)
    with_billing do
      get admin_promo_codes_path
      assert_response :not_found
      post admin_promo_codes_path, params: valid_params
      assert_response :not_found
      post deactivate_admin_promo_code_path("promo_1")
      assert_response :not_found
    end
    assert_not_requested :any, /api\.stripe\.com/
  end

  test "without Stripe the page explains it and nothing can be created" do
    sign_in_as @admin
    get admin_promo_codes_path, headers: inertia_headers
    assert_response :success
    assert_equal "admin/promo_codes/index", response.parsed_body["component"]
    assert_equal false, props["stripeEnabled"]
    assert_equal [], props["codes"]
    assert_match(/\ABETA-[A-Z2-9]{4}\z/, props["suggestedCode"])

    assert_no_difference -> { AdminEvent.count } do
      post admin_promo_codes_path, params: valid_params
    end
    assert_redirected_to admin_promo_codes_path
    assert_equal I18n.t("admin_promo_codes.flash.disabled"), flash[:alert]
    assert_not_requested :any, /api\.stripe\.com/
  end

  test "lists the Stripe codes with their coupon, plans, note and recorded payments" do
    sign_in_as @admin
    BillingPayment.create!(user: users(:bob), plan_key: "yearly", currency: "eur", amount_cents: 0, paid_at: 1.day.ago, promotion_code: "BETA-K7QX")
    list = stub_stripe_get("promotion_codes", { "object" => "list", "has_more" => true, "data" => [ promotion_code ] })
    with_billing { get admin_promo_codes_path, headers: inertia_headers }
    assert_response :success
    assert_requested list
    assert_requested :get, "https://api.stripe.com/v1/promotion_codes", query: { "limit" => "100", "expand" => [ "data.promotion.coupon" ] }
    assert_equal true, props["stripeEnabled"]
    assert_equal %w[yearly atelier bureau], props["defaultPlanKeys"]
    assert_equal [ true ] * 4, props["plans"].map { _1["configured"] }
    row = props["codes"].sole
    assert_equal [ "BETA-K7QX", true, 2, 20, 100.0, "repeating", 3, %w[yearly atelier], "Bêta testeurs automne 2026", "staff@example.org", 1, true ],
      row.values_at("code", "active", "timesRedeemed", "maxRedemptions", "percentOff", "duration", "durationInMonths", "planKeys", "note",
                    "createdBy", "paymentsCount", "firstTimeOnly")
    assert_equal true, props["hasMore"]
    assert_equal "promo_1", props["nextAfter"]
  end

  test "a Stripe failure on the list is shown instead of crashing" do
    sign_in_as @admin
    stub_stripe_get("promotion_codes", { "error" => { "message" => "Invalid API Key provided", "type" => "invalid_request_error" } }, status: 401)
    with_billing { get admin_promo_codes_path, headers: inertia_headers }
    assert_response :success
    assert_equal [], props["codes"]
    assert_match "Invalid API Key", props["listError"]
  end

  test "creating a code makes one coupon for the plans' products, then its promotion code, and logs it" do
    sign_in_as @admin
    stub_prices
    coupons = []
    codes = []
    stub_stripe_post("coupons", { "id" => "co_new", "object" => "coupon" }, log: coupons)
    stub_stripe_post("promotion_codes", promotion_code(id: "promo_new"), log: codes)

    travel_to Time.zone.parse("2026-10-18 10:00") do
      with_billing do
        assert_difference -> { AdminEvent.count } do
          post admin_promo_codes_path, params: valid_params
        end
      end
    end
    assert_redirected_to admin_promo_codes_path
    assert_equal I18n.t("admin_promo_codes.flash.created", code: "BETA-K7QX"), flash[:notice]

    metadata = { "created_by" => "staff@example.org", "note" => "Bêta testeurs automne 2026", "plan_keys" => "yearly,atelier,bureau" }
    assert_equal [ {
      "name" => "BETA-K7QX", "duration" => "repeating", "duration_in_months" => "3", "percent_off" => "100.0",
      "applies_to" => { "products" => { "0" => "prod_home", "1" => "prod_pro", "2" => "prod_team" } }, "metadata" => metadata
    } ], coupons
    assert_equal [ {
      "promotion" => { "type" => "coupon", "coupon" => "co_new" }, "code" => "BETA-K7QX", "max_redemptions" => "20",
      "expires_at" => Time.zone.parse("2026-12-31").end_of_day.to_i.to_s,
      "restrictions" => { "first_time_transaction" => "true" }, "metadata" => metadata
    } ], codes
    assert_not_requested :get, stripe_api("prices/price_drone")

    event = AdminEvent.newest_first.first
    assert_equal [ "promotion_code_created", @admin, "BETA-K7QX", "promo_new" ], [ event.action, event.admin, event.details["code"], event.details["promotion_code_id"] ]
    assert_equal "BETA-K7QX", event.as_admin_json[:target][:name]
  end

  test "a fixed amount once, for one plan, without limits" do
    sign_in_as @admin
    stub_prices
    coupons = []
    codes = []
    stub_stripe_post("coupons", { "id" => "co_new" }, log: coupons)
    stub_stripe_post("promotion_codes", promotion_code(id: "promo_new", code: "AMI-20"), log: codes)
    with_billing do
      post admin_promo_codes_path, params: valid_params(code: "AMI-20", discount_type: "amount", percent_off: "", amount_off: "20.5",
        duration: "once", duration_in_months: "", plan_keys: %w[yearly], max_redemptions: "", expires_on: "", first_time_only: "0", note: "")
    end
    assert_redirected_to admin_promo_codes_path
    assert_equal({ "name" => "AMI-20", "duration" => "once", "amount_off" => "2050", "currency" => "eur",
                   "applies_to" => { "products" => { "0" => "prod_home" } }, "metadata" => { "created_by" => "staff@example.org", "plan_keys" => "yearly" } },
      coupons.sole)
    assert_equal({ "promotion" => { "type" => "coupon", "coupon" => "co_new" }, "code" => "AMI-20",
                   "metadata" => { "created_by" => "staff@example.org", "plan_keys" => "yearly" } }, codes.sole)
  end

  test "invalid input comes back on the form, in French, without calling Stripe" do
    sign_in_as @admin
    with_billing do
      post admin_promo_codes_path, params: valid_params(code: "é!", percent_off: "150", plan_keys: [], expires_on: "2020-01-01")
      assert_redirected_to admin_promo_codes_path
      follow_redirect!(headers: inertia_headers)
    end
    errors = props["errors"]
    assert_equal I18n.t("activemodel.errors.models.billing/promo_code_form.attributes.code.code_format"), errors["code"].first
    assert_equal I18n.t("activemodel.errors.models.billing/promo_code_form.attributes.percent_off.percent_range"), errors["percent_off"].first
    assert_equal I18n.t("activemodel.errors.models.billing/promo_code_form.attributes.plan_keys.no_plan"), errors["plan_keys"].first
    assert errors["expires_on"].present?
    assert_not_requested :any, /api\.stripe\.com\/v1\/(coupons|promotion_codes)\z/
  end

  test "a plan without a Stripe price cannot be chosen" do
    sign_in_as @admin
    with_billing("STRIPE_PRICE_DRONE" => nil) do
      get admin_promo_codes_path, headers: inertia_headers
      assert_equal false, props["plans"].find { _1["key"] == "drone" }["configured"]
      post admin_promo_codes_path, params: valid_params(plan_keys: %w[yearly drone])
      follow_redirect!(headers: inertia_headers)
    end
    assert_equal "Pas encore de prix Stripe pour : Mission drone.", props["errors"]["plan_keys"].first
  end

  test "a code Stripe already has is refused in French, and the coupon made for it is removed" do
    sign_in_as @admin
    stub_prices
    stub_stripe_post("coupons", { "id" => "co_new" })
    stub_stripe_post("promotion_codes", { "error" => { "type" => "invalid_request_error", "code" => "resource_already_exists",
                                                        "message" => "An active promotion code with `code: BETA-K7QX` already exists." } }, status: 400)
    deleted = stub_request(:delete, stripe_api("coupons/co_new")).to_return(status: 200, body: { "id" => "co_new", "deleted" => true }.to_json)
    with_billing do
      assert_no_difference -> { AdminEvent.count } do
        post admin_promo_codes_path, params: valid_params
      end
      assert_redirected_to admin_promo_codes_path
      follow_redirect!(headers: inertia_headers)
    end
    assert_requested deleted
    assert_equal I18n.t("admin_promo_codes.errors.code_taken"), props["errors"]["code"]
  end

  test "other Stripe refusals are shown above the form" do
    sign_in_as @admin
    stub_prices
    stub_stripe_post("coupons", { "error" => { "type" => "invalid_request_error", "message" => "Invalid currency" } }, status: 400)
    with_billing do
      post admin_promo_codes_path, params: valid_params
      follow_redirect!(headers: inertia_headers)
    end
    assert_equal I18n.t("admin_promo_codes.errors.stripe", message: "Invalid currency"), props["errors"]["base"]
    assert_not_requested :post, stripe_api("promotion_codes")
  end

  test "deactivating a code switches it off in Stripe and logs it" do
    sign_in_as @admin
    updates = []
    stub_stripe_post("promotion_codes/promo_1", promotion_code(active: false), log: updates)
    with_billing do
      assert_difference -> { AdminEvent.where(action: "promotion_code_deactivated").count } do
        post deactivate_admin_promo_code_path("promo_1")
      end
    end
    assert_redirected_to admin_promo_codes_path
    assert_equal [ { "active" => "false" } ], updates
    assert_equal I18n.t("admin_promo_codes.flash.deactivated", code: "BETA-K7QX"), flash[:notice]
  end

  test "deactivating shows Stripe's refusal" do
    sign_in_as @admin
    stub_stripe_post("promotion_codes/promo_x", { "error" => { "type" => "invalid_request_error", "message" => "No such promotion code" } }, status: 404)
    with_billing { post deactivate_admin_promo_code_path("promo_x") }
    assert_redirected_to admin_promo_codes_path
    assert_equal I18n.t("admin_promo_codes.errors.stripe", message: "No such promotion code"), flash[:alert]
    assert_equal 0, AdminEvent.where(action: "promotion_code_deactivated").count
  end
end
