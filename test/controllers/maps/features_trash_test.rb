require "test_helper"

# Deleting from the editor goes to the trash; « Annuler » restores.
class Maps::FeaturesTrashTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:michael)
    @map = maps(:ahinvaux)
  end

  test "delete trashes, restore brings the same element back" do
    pond = map_features(:pond)
    delete map_feature_path(@map, pond), as: :json
    assert_response :no_content
    assert pond.reload.trashed?

    get map_features_path(@map), as: :json
    assert_not_includes response.parsed_body["features"].map { _1["id"] }, pond.id

    post restore_map_feature_path(@map, pond), as: :json
    assert_response :success
    assert_equal pond.id, response.parsed_body["id"]
    assert_not pond.reload.trashed?
  end

  test "restoring an element that is not in the trash is not found" do
    post restore_map_feature_path(@map, map_features(:pond)), as: :json
    assert_response :not_found
  end

  test "a viewer cannot restore" do
    pond = map_features(:pond)
    pond.trash!
    sign_in_as map_memberships(:ahinvaux_viewer).user
    post restore_map_feature_path(@map, pond), as: :json
    assert_response :forbidden
    assert pond.reload.trashed?
  end
end
