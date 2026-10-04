require "test_helper"
require_relative "../test_helpers/collab_test_helper"
require_relative "../test_helpers/billing_test_helper"

# What taking a map over changes for the recipient's plan (shown before they
# accept), with the rule of Map#read_only_by_plan?.
class MapTransferPlanImpactTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup do
    @owner = users(:michael)
    @recipient = make_user("Léa")
    @map = Map.create!(name: "Verger", owner: @owner, region: regions(:wallonia), created_at: 6.months.ago)
  end

  def impact = MapTransfer::PlanImpact.new(@map, @recipient)

  def give_yearly_pass(user)
    user.plan_purchases.create!(plan_key: "yearly", starts_at: 1.day.ago, expires_at: 1.year.from_now, stripe_checkout_session_id: "cs_#{user.id}")
  end

  test "billing off (beta): nothing changes, nothing alarming" do
    Map.create!(name: "Plus ancienne", owner: @recipient, region: regions(:wallonia), created_at: 1.year.ago)
    json = impact.as_json
    assert_equal false, json[:billing]
    assert_equal false, json[:mapReadOnly]
    assert_empty json[:mapsBecomingReadOnly]
    assert_empty json[:lostFeatures]
    assert_equal false, json[:changesAnything]
  end

  test "a free recipient without maps keeps the map editable" do
    with_billing do
      json = impact.as_json
      assert_equal true, json[:billing]
      assert_equal "free", json[:plan]
      assert_equal "carte gratuite", json[:planName]
      assert_equal 1, json[:maxMaps]
      assert_equal false, json[:mapReadOnly]
      assert_empty json[:mapsBecomingReadOnly]
      assert_equal false, json[:changesAnything]
    end
  end

  test "a free recipient with an older map: the map taken over would be read-only" do
    Map.create!(name: "Potager", owner: @recipient, region: regions(:wallonia), created_at: 1.year.ago)
    with_billing do
      assert impact.map_read_only?
      assert_empty impact.maps_becoming_read_only
      assert impact.changes_anything?
    end
  end

  test "a free recipient with a newer map: that map would become read-only (the oldest maps keep their place)" do
    newer = Map.create!(name: "Potager", owner: @recipient, region: regions(:wallonia), created_at: 1.month.ago)
    with_billing do
      assert_not newer.read_only_by_plan?
      assert_not impact.map_read_only?
      assert_equal [ { id: newer.id, name: "Potager" } ], impact.as_json[:mapsBecomingReadOnly]
    end
  end

  test "maps already read-only or archived are not reported" do
    Map.create!(name: "Archivée", owner: @recipient, region: regions(:wallonia), created_at: 2.years.ago, archived_at: 1.day.ago)
    oldest = Map.create!(name: "Potager", owner: @recipient, region: regions(:wallonia), created_at: 1.year.ago)
    Map.create!(name: "Déjà en lecture seule", owner: @recipient, region: regions(:wallonia), created_at: 1.month.ago)
    with_billing do
      assert impact.map_read_only?
      assert_empty impact.maps_becoming_read_only
      assert_not oldest.read_only_by_plan?
    end
  end

  test "a paid recipient takes the map over without losing anything" do
    give_yearly_pass(@owner)
    give_yearly_pass(@recipient)
    Map.create!(name: "Potager", owner: @recipient, region: regions(:wallonia), created_at: 1.year.ago)
    with_billing do
      json = impact.as_json
      assert_equal "yearly", json[:plan]
      assert_equal false, json[:mapReadOnly]
      assert_empty json[:lostFeatures]
      assert_equal false, json[:changesAnything]
    end
  end

  test "paid features the map has today and the recipient's plan lacks" do
    give_yearly_pass(@owner)
    with_billing do
      assert_equal %w[pdf_export analyses ai_drafts], impact.as_json[:lostFeatures]
      assert impact.changes_anything?
    end
  end

  test "agrees with Map#read_only_by_plan? once the map is taken over" do
    Map.create!(name: "Potager", owner: @recipient, region: regions(:wallonia), created_at: 1.year.ago)
    with_billing do
      predicted = impact.map_read_only?
      @map.update_columns(owner_id: @recipient.id)
      assert_equal predicted, @map.reload.read_only_by_plan?
    end
  end
end
