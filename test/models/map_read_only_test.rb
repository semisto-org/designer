require "test_helper"
require_relative "../test_helpers/billing_test_helper"

class MapReadOnlyTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup do
    @owner = users(:bob)
    @first = Map.create!(name: "Première", owner: @owner, region: regions(:wallonia), created_at: 3.months.ago)
    @second = Map.create!(name: "Deuxième", owner: @owner, region: regions(:wallonia), created_at: 2.months.ago)
    @third = Map.create!(name: "Troisième", owner: @owner, region: regions(:wallonia), created_at: 1.month.ago)
  end

  test "never read-only while billing is disabled (closed beta)" do
    assert_not Billing.enabled?
    assert_not @third.read_only_by_plan?
  end

  test "on the free plan only the oldest map stays editable" do
    with_billing do
      assert_not @first.read_only_by_plan?
      assert @second.read_only_by_plan?
      assert @third.read_only_by_plan?
    end
  end

  test "a valid yearly pass unlocks the other maps, expiry locks them again" do
    with_billing do
      pass = @owner.plan_purchases.create!(plan_key: "yearly", starts_at: 1.month.ago, expires_at: 11.months.from_now, stripe_checkout_session_id: "cs_1")
      assert_not @third.reload.read_only_by_plan?
      pass.update!(expires_at: 1.day.ago)
      assert @third.reload.read_only_by_plan?
      assert_not @first.reload.read_only_by_plan?
    end
  end

  test "archived maps free their place" do
    with_billing do
      @first.update!(archived_at: Time.current)
      assert_not @second.reload.read_only_by_plan?
      assert @third.reload.read_only_by_plan?
    end
  end

  test "counts read-only maps for the billing page" do
    with_billing do
      assert_equal 2, @owner.read_only_maps_count
    end
    assert_equal 0, @owner.read_only_maps_count
  end
end
