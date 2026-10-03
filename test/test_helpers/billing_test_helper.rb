# Helpers for billing tests: Stripe settings, signed webhook requests, and
# realistic payloads (API version 2026 "endive": subscription id on
# invoice.parent, period dates on the subscription items, taxes in total_taxes).
module BillingTestHelper
  STRIPE_ENV = {
    "STRIPE_SECRET_KEY" => "sk_test_123",
    "STRIPE_WEBHOOK_SECRET" => "whsec_test_secret",
    "STRIPE_PRICE_YEARLY" => "price_yearly",
    "STRIPE_PRICE_ATELIER" => "price_atelier",
    "STRIPE_PRICE_BUREAU" => "price_bureau",
    "STRIPE_PRICE_DRONE" => "price_drone"
  }.freeze

  def with_billing(overrides = {})
    env = STRIPE_ENV.merge(overrides.stringify_keys)
    saved = env.keys.index_with { |key| ENV[key] }
    env.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    yield
  ensure
    saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  def stripe_signature(payload, secret: STRIPE_ENV["STRIPE_WEBHOOK_SECRET"], at: Time.now)
    "t=#{at.to_i},v1=#{Stripe::Webhook::Signature.compute_signature(at, payload, secret)}"
  end

  # Posts a signed event to the webhook endpoint.
  def post_stripe_event(event, signature: nil)
    payload = event.to_json
    post "/webhooks/stripe", params: payload,
      headers: { "CONTENT_TYPE" => "application/json", "Stripe-Signature" => signature || stripe_signature(payload) }
  end

  def stripe_event(type, object, id: "evt_#{SecureRandom.hex(6)}", created: Time.now.to_i)
    { "id" => id, "object" => "event", "type" => type, "created" => created, "livemode" => false,
      "data" => { "object" => object } }
  end

  def checkout_session(user:, plan_key: "yearly", id: "cs_test_#{SecureRandom.hex(6)}", mode: "payment", amount_total: 7_900,
                       amount_tax: 1_371, amount_discount: 0, discounts: [], subscription: nil, customer: "cus_123")
    {
      "id" => id, "object" => "checkout.session", "mode" => mode, "payment_status" => "paid", "status" => "complete",
      "customer" => customer, "client_reference_id" => user.id.to_s, "currency" => "eur", "livemode" => false,
      "amount_total" => amount_total, "payment_intent" => (mode == "payment" ? "pi_#{id}" : nil),
      "subscription" => subscription, "invoice" => nil, "discounts" => discounts,
      "metadata" => { "user_id" => user.id.to_s, "plan_key" => plan_key },
      "total_details" => { "amount_tax" => amount_tax, "amount_discount" => amount_discount }
    }
  end

  def subscription_object(user:, id: "sub_123", status: "active", price: "price_atelier", customer: "cus_123",
                          period_end: 1.month.from_now.to_i, cancel_at_period_end: false, metadata: nil)
    {
      "id" => id, "object" => "subscription", "status" => status, "customer" => customer,
      "cancel_at_period_end" => cancel_at_period_end, "canceled_at" => nil, "ended_at" => nil,
      "metadata" => metadata || { "user_id" => user.id.to_s, "plan_key" => "atelier" },
      "items" => { "data" => [ { "id" => "si_1", "price" => { "id" => price }, "current_period_start" => Time.now.to_i,
                                 "current_period_end" => period_end } ] }
    }
  end

  def invoice_object(id: "in_123", subscription: "sub_123", customer: "cus_123", amount_paid: 4_900, tax: 850,
                     discounts: [], hosted_invoice_url: "https://invoice.stripe.com/i/acct/in_123")
    {
      "id" => id, "object" => "invoice", "customer" => customer, "currency" => "eur", "livemode" => false,
      "amount_paid" => amount_paid, "total_taxes" => [ { "amount" => tax, "taxability_reason" => "standard_rated" } ],
      "total_discount_amounts" => [], "discounts" => discounts,
      "parent" => (subscription && { "type" => "subscription_details", "subscription_details" => { "subscription" => subscription, "metadata" => {} } }),
      "status_transitions" => { "paid_at" => Time.now.to_i },
      "hosted_invoice_url" => hosted_invoice_url, "invoice_pdf" => "#{hosted_invoice_url}/pdf"
    }
  end

  def stripe_api(path) = "https://api.stripe.com/v1/#{path}"

  def stub_stripe_get(path, body, status: 200)
    stub_request(:get, /\Ahttps:\/\/api\.stripe\.com\/v1\/#{Regexp.escape(path)}(\?.*)?\z/)
      .to_return(status:, body: body.to_json, headers: { "Content-Type" => "application/json" })
  end
end
