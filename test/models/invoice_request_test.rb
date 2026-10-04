require "test_helper"

class InvoiceRequestTest < ActiveSupport::TestCase
  include ActionMailer::TestHelper

  setup { @user = users(:bob) }

  def build(**attributes)
    @user.invoice_requests.new({
      organization_name: "Administration communale de Yvoir", billing_address: "Rue de l'Hôtel de Ville 1\n5530 Yvoir",
      billing_email: "compta@yvoir.be", plan_key: "bureau"
    }.merge(attributes))
  end

  test "a valid request is priced from the catalogue for a year, tax included" do
    assert_equal 118_800, build.tap(&:save!).amount_cents
    assert_equal 58_800, build(plan_key: "atelier").tap(&:save!).amount_cents
    assert_equal 7_900, build(plan_key: "yearly").tap(&:save!).amount_cents
    request = build.tap(&:save!)
    assert_equal [ "requested", 12, "eur" ], [ request.status, request.duration_months, request.currency ]
  end

  test "the price is frozen when the request is sent, whatever is posted" do
    request = build(amount_cents: 1)
    request.save!
    assert_equal 118_800, request.amount_cents
  end

  test "requires the organisation, its address and a valid billing e-mail" do
    request = build(organization_name: " ", billing_address: "\n \n", billing_email: "nope")
    assert_not request.valid?
    assert_equal [ "Indique le nom de l'organisation à facturer." ], request.errors[:organization_name]
    assert_equal [ "Indique l'adresse qui doit figurer sur la facture." ], request.errors[:billing_address]
    assert_equal [ "Cette adresse e-mail ne semble pas valide." ], request.errors[:billing_email]
    assert_equal [ "Indique l'adresse e-mail qui recevra la facture." ], build(billing_email: "").tap(&:valid?).errors[:billing_email]
  end

  test "only the plans sold for a year can be asked for" do
    %w[free drone nope].each do |plan_key|
      request = build(plan_key:)
      assert_not request.valid?, plan_key
      assert_equal [ "Choisis une formule." ], request.errors[:plan_key]
    end
  end

  test "limits the free-text fields (the purchase order is printed on the invoice)" do
    assert_not build(purchase_order: "x" * 101).valid?
    assert_not build(company_number: "x" * 41).valid?
    assert_not build(message: "x" * 3_001).valid?
    assert build(purchase_order: "x" * 100, company_number: "BE0123456789", message: "Merci").valid?
  end

  test "normalizes what people type" do
    request = build(organization_name: "  Commune   de Yvoir ", billing_email: " Compta@Yvoir.BE ", purchase_order: "  ",
                    billing_address: "  Rue X 1 \n\n 5530   Yvoir  \n")
    request.save!
    assert_equal "Commune de Yvoir", request.organization_name
    assert_equal "compta@yvoir.be", request.billing_email
    assert_nil request.purchase_order
    assert_equal "Rue X 1\n5530 Yvoir", request.billing_address
  end

  test "Semisto and the requester are e-mailed once the request is saved" do
    assert_enqueued_emails(2) { build.save! }
  end

  test "activating starts the plan for 12 months, once" do
    request = build.tap(&:save!)
    start = Time.zone.local(2026, 11, 1)
    grant = request.activate!(starts_at: start, by: users(:michael))
    assert_equal [ "bureau", start, start + 12.months, users(:michael) ], [ grant.plan_key, grant.starts_at, grant.ends_at, grant.granted_by ]
    assert_equal @user, grant.user
    assert_no_difference "PlanGrant.count" do
      assert_equal grant, request.reload.activate!(starts_at: Time.current)
    end
  end

  test "a renewal starts when the same plan granted before ends" do
    previous = build.tap(&:save!).activate!
    renewal = build.tap(&:save!).activate!
    assert_in_delta previous.ends_at, renewal.starts_at, 1
    other_plan = build(plan_key: "atelier").tap(&:save!).activate!
    assert_in_delta Time.current, other_plan.starts_at, 5
  end

  test "a cancelled request cannot start a plan" do
    request = build.tap(&:save!)
    request.cancel!
    assert_raises(InvoiceRequest::Closed) { request.activate! }
    assert_equal 0, PlanGrant.count
  end

  test "cancelling stops a plan already started, without deleting it" do
    request = build.tap(&:save!)
    grant = request.activate!
    request.cancel!(by: users(:michael))
    assert_equal [ "cancelled", users(:michael) ], [ request.status, request.handled_by ]
    assert request.cancelled_at
    assert grant.reload.revoked?
    assert_equal "free", @user.reload.current_plan_key
  end

  test "marking paid is kept once" do
    request = build.tap(&:save!)
    paid_at = 2.days.ago.change(usec: 0)
    request.mark_paid!(at: paid_at)
    request.mark_paid!(at: Time.current)
    assert_equal [ "paid", paid_at ], [ request.status, request.paid_at ]
    assert_not request.open?
  end

  test "the Stripe address and the EU VAT number come from what was typed" do
    request = build(company_number: "be 0207.360.311")
    assert_equal({ line1: "Rue de l'Hôtel de Ville 1", postal_code: "5530", city: "Yvoir", country: "BE" }, request.stripe_address)
    assert_equal "BE0207360311", request.eu_vat_number
    assert_nil build(company_number: "0207.360.311").eu_vat_number
  end

  test "the yearly amount of each plan, for the form" do
    assert_equal [
      { key: "atelier", amountCents: 58_800, monthlyCents: 4_900 },
      { key: "bureau", amountCents: 118_800, monthlyCents: 9_900 },
      { key: "yearly", amountCents: 7_900, monthlyCents: nil }
    ], InvoiceRequest.plans_json
  end
end
