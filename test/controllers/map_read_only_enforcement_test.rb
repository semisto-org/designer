require "test_helper"
require_relative "../test_helpers/billing_test_helper"

# After a plan ends, maps over the free limit stay readable but cannot be edited.
class MapReadOnlyEnforcementTest < ActionDispatch::IntegrationTest
  include BillingTestHelper

  setup do
    @owner = users(:bob)
    @editable = Map.create!(name: "Première", owner: @owner, region: regions(:wallonia), created_at: 2.months.ago)
    @locked = Map.create!(name: "Deuxième", owner: @owner, region: regions(:wallonia), created_at: 1.month.ago)
    sign_in_as @owner
  end

  test "the owner cannot draw on a read-only map: 403 with a French message and the upsell link" do
    with_billing do
      post map_features_path(@locked), params: { feature: { layer: "water", kind: "water_tank", geometry: point } }, as: :json
      assert_response :forbidden
      body = response.parsed_body
      assert_equal "read_only_by_plan", body["code"]
      assert_equal "/billing", body["upsellUrl"]
      assert_includes body["message"], "lecture seule"
      assert_includes body["message"], "Rien n'est supprimé"
      assert_equal 0, @locked.features.count
    end
  end

  test "update and delete of existing features are blocked too" do
    feature = @locked.features.create!(layer: "water", kind: "water_tank", geometry: point, created_by: @owner, updated_by: @owner)
    with_billing do
      patch map_feature_path(@locked, feature), params: { feature: { name: "X", lock_version: 0 } }, as: :json
      assert_response :forbidden
      delete map_feature_path(@locked, feature), as: :json
      assert_response :forbidden
      assert MapFeature.exists?(feature.id)
    end
  end

  test "renaming a read-only map is refused with a redirect and an alert" do
    with_billing do
      patch map_path(@locked), params: { map: { name: "Autre nom", lock_version: @locked.lock_version } }
      assert_redirected_to map_path(@locked)
      assert_includes flash[:alert], "lecture seule"
      assert_equal "Deuxième", @locked.reload.name
    end
  end

  test "the owner can still view, read the features and archive a read-only map" do
    @locked.features.create!(layer: "water", kind: "water_tank", geometry: point, created_by: @owner, updated_by: @owner)
    with_billing do
      get map_path(@locked), headers: inertia_headers
      assert_response :success
      assert_equal true, response.parsed_body.dig("props", "map", "readOnlyByPlan")
      get map_features_path(@locked), as: :json
      assert_equal 1, response.parsed_body["features"].size
      delete map_path(@locked)
      assert_redirected_to maps_path
      assert @locked.reload.archived_at
    end
  end

  test "the free map stays fully editable" do
    with_billing do
      post map_features_path(@editable), params: { feature: { layer: "water", kind: "water_tank", geometry: point } }, as: :json
      assert_response :created
      get map_path(@editable), headers: inertia_headers
      assert_equal false, response.parsed_body.dig("props", "map", "readOnlyByPlan")
    end
  end

  test "invited editors are blocked as well, with the owner's plan" do
    @locked.memberships.create!(user: users(:alice), role: "editor")
    sign_out
    sign_in_as users(:alice)
    with_billing do
      post map_features_path(@locked), params: { feature: { layer: "water", kind: "water_tank", geometry: point } }, as: :json
      assert_response :forbidden
      assert_equal "read_only_by_plan", response.parsed_body["code"]
    end
  end

  test "a valid yearly pass makes every map editable again" do
    @owner.plan_purchases.create!(plan_key: "yearly", starts_at: 1.day.ago, expires_at: 1.year.from_now, stripe_checkout_session_id: "cs_1")
    with_billing do
      post map_features_path(@locked), params: { feature: { layer: "water", kind: "water_tank", geometry: point } }, as: :json
      assert_response :created
    end
  end

  test "nothing is locked while billing is not configured (closed beta)" do
    post map_features_path(@locked), params: { feature: { layer: "water", kind: "water_tank", geometry: point } }, as: :json
    assert_response :created
  end

  test "viewers keep the usual read-only message" do
    sign_out
    sign_in_as users(:alice)
    maps(:ahinvaux)   # alice is a viewer of michael's map
    with_billing do
      post map_features_path(maps(:ahinvaux)), params: { feature: { layer: "water", kind: "water_tank", geometry: point } }, as: :json
      assert_response :forbidden
      assert_equal "Vous avez accès à cette carte en lecture seule.", response.parsed_body["message"]
    end
  end
end
