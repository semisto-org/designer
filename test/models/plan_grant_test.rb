require "test_helper"

class PlanGrantTest < ActiveSupport::TestCase
  include ActionMailer::TestHelper

  setup { @user = users(:bob) }

  def grant(**attributes)
    @user.plan_grants.create!({ plan_key: "atelier", starts_at: 1.day.ago, ends_at: 1.year.from_now }.merge(attributes))
  end

  test "needs a known plan and an end after its start" do
    assert_not @user.plan_grants.new(plan_key: "drone", starts_at: Time.current, ends_at: 1.day.from_now).valid?
    invalid = @user.plan_grants.new(plan_key: "bureau", starts_at: Time.current, ends_at: 1.day.ago)
    assert_not invalid.valid?
    assert_equal [ "doit venir après la date de début." ], invalid.errors[:ends_at]
  end

  test "is active between its dates, unless revoked" do
    current = grant
    assert current.active?
    assert_not current.active?(2.years.from_now)
    assert_not current.active?(2.days.ago)
    current.revoke!
    assert_not current.active?
    assert_equal [], PlanGrant.active_at(Time.current).to_a
  end

  test "revoking keeps the first revocation date" do
    current = grant
    at = 1.hour.ago.change(usec: 0)
    current.revoke!(at:)
    current.revoke!
    assert_equal at, current.reload.revoked_at
  end

  test "next start: now, or the end of the same plan already granted" do
    current = grant(plan_key: "bureau", ends_at: 3.months.from_now)
    assert_in_delta current.ends_at, PlanGrant.next_start(@user, "bureau"), 1
    assert_in_delta Time.current, PlanGrant.next_start(@user, "atelier"), 2
    current.revoke!
    assert_in_delta Time.current, PlanGrant.next_start(@user, "bureau"), 2
  end

  test "a grant on an invoice request tells its owner, a hand-made one does not" do
    assert_no_enqueued_emails { grant }
    request = @user.invoice_requests.create!(organization_name: "Commune", billing_address: "Rue 1\n5530 Yvoir", billing_email: "a@b.be", plan_key: "atelier")
    assert_enqueued_email_with InvoicingMailer, :plan_activated, args: ->(args) { args.first.invoice_request == request } do
      request.activate!
    end
  end

  test "the billing page view of a grant" do
    json = grant(ends_at: 10.days.from_now).as_json_for_billing
    assert_equal [ "atelier", true, nil, false, 10 ], json.values_at(:planKey, :active, :revokedAt, :onInvoice, :daysLeft)
  end
end
