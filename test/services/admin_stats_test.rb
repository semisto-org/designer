require "test_helper"

class AdminStatsTest < ActiveSupport::TestCase
  test "counts accounts, sign-ups by week, paying accounts and net revenue" do
    now = Time.zone.parse("2027-03-10 12:00")
    travel_to now do
      User.create!(email_address: "new@example.org", created_at: 2.days.ago, last_signed_in_at: 1.day.ago)
      User.create!(email_address: "older@example.org", created_at: 20.days.ago)
      bob = users(:bob)
      PlanGrant.create!(user: bob, plan_key: "atelier", starts_at: 1.day.ago, ends_at: 1.year.from_now)
      BillingPayment.create!(user: bob, plan_key: "atelier", amount_cents: 4_900, paid_at: 3.days.ago, refunded_cents: 900)
      BillingPayment.create!(user: bob, plan_key: "atelier", amount_cents: 4_900, paid_at: 3.days.ago, livemode: false)

      stats = Admin::Stats.call
      assert_equal 1, stats[:users][:new7d]
      assert_equal 2, stats[:users][:new30d]
      assert_operator stats[:users][:active30d], :>=, 1
      assert_equal({ "atelier" => 1 }, stats[:plans][:byPlan])
      assert_equal 1, stats[:plans][:paying]
      assert_equal 4_000, stats[:revenue][:year]
      assert_equal 1, stats[:revenue][:count]

      weeks = stats[:signupsByWeek]
      assert_equal 12, weeks.size
      assert_equal Date.new(2027, 3, 8).iso8601, weeks.last[:week]
      assert_equal 1, weeks.last[:count]
    end
  end
end
