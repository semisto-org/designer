require "test_helper"

class Maps::StorageReadingsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @cellar = @map.features.create!(layer: "structures", kind: "fruit_store", name: "Cave", geometry: point, properties: { "store_type" => "cellar" })
  end

  test "an editor notes a reading, reads it back and removes it" do
    sign_in_as users(:michael)
    post map_feature_storage_readings_path(@map, @cellar), params: { storage_reading: { measured_on: "2026-10-03", temperature_c: "18", humidity_pct: "70" } }, as: :json
    assert_response :created
    body = response.parsed_body
    assert_equal 18.0, body["reading"]["temperatureC"]
    assert_equal "bad", body["summary"]["latest"]["verdict"]["overall"]
    assert_equal [ 0.5, 6.0 ], body["ranges"]["temperatureC"]["good"]

    delete map_feature_storage_reading_path(@map, @cellar, body["reading"]["id"]), as: :json
    assert_response :success
    assert_empty response.parsed_body["readings"]
  end

  test "an empty reading is refused with its reason" do
    sign_in_as users(:michael)
    post map_feature_storage_readings_path(@map, @cellar), params: { storage_reading: { measured_on: "2026-10-03" } }, as: :json
    assert_response :unprocessable_entity
    assert_match "température", response.parsed_body["message"]
  end

  test "only a fruit store has readings" do
    sign_in_as users(:michael)
    get map_feature_storage_readings_path(@map, map_features(:pond)), as: :json
    assert_response :not_found
  end

  test "a viewer reads but does not write, a stranger sees nothing" do
    sign_in_as users(:alice)
    get map_feature_storage_readings_path(@map, @cellar), as: :json
    assert_response :success
    post map_feature_storage_readings_path(@map, @cellar), params: { storage_reading: { measured_on: "2026-10-03", humidity_pct: 80 } }, as: :json
    assert_response :forbidden

    sign_in_as users(:bob)
    get map_feature_storage_readings_path(@map, @cellar), as: :json
    assert_response :not_found
  end
end
