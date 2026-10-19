require "test_helper"

class Billing::PlanGiftTest < ActiveSupport::TestCase
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @now = Time.zone.local(2026, 10, 19, 12)
  end

  def gift(plan_key = "yearly", ends_on = Date.new(2027, 3, 31)) = Billing::PlanGift.new(plan_key:, ends_on:, by: @admin, at: @now)

  test "gives a plan until the end of the chosen day, once" do
    grant = gift.give(users(:alice))
    assert_equal [ "yearly", @now, Time.zone.local(2027, 4, 1), @admin, "Offerte par Semisto" ],
      [ grant.plan_key, grant.starts_at, grant.ends_at, grant.granted_by, grant.notes ]
    assert_not grant.on_invoice?
    assert_equal "yearly", users(:alice).current_plan_key(at: @now)
    assert_nil gift.give(users(:alice)), "already given"
    assert gift("yearly", Date.new(2027, 6, 30)).give(users(:alice)), "a longer gift is new"
  end

  test "refuses an unknown plan or a past date" do
    assert_raises(Billing::PlanGift::Error) { gift("free") }
    assert_raises(Billing::PlanGift::Error) { gift("yearly", Date.new(2026, 10, 18)) }
  end

  test "gives every free account created before the date, never twice, and leaves paying accounts alone" do
    User.where(id: [ users(:alice).id, users(:bob).id ]).update_all(created_at: Time.zone.local(2026, 9, 1))
    late = User.create!(email_address: "late@example.org", name: "Late", created_at: Time.zone.local(2026, 10, 20))
    paying = User.create!(email_address: "paying@example.org", name: "Paying", created_at: Time.zone.local(2026, 9, 1))
    paying.plan_grants.create!(plan_key: "atelier", starts_at: @now - 1.day, ends_at: @now + 1.year)
    before = Time.zone.local(2026, 10, 19)

    count = gift.give_all(created_before: before)
    assert_operator count, :>=, 2
    assert_equal "yearly", users(:alice).current_plan_key(at: @now)
    assert_equal "yearly", users(:bob).current_plan_key(at: @now)
    assert_equal "free", late.current_plan_key(at: @now)
    assert_equal 1, paying.plan_grants.count
    assert_equal 0, gift.give_all(created_before: before)
  end
end
