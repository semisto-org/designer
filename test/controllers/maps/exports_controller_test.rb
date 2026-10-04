require "test_helper"

class Maps::ExportsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @map.memberships.create!(user: users(:bob), role: "editor")
    @map.features.create!(layer: "networks", kind: "water_pipe", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.34 ], [ 4.906, 50.34 ] ] })
    @map.features.create!(layer: "water", kind: "swale", geometry: { "type" => "LineString", "coordinates" => [ [ 4.905, 50.341 ], [ 4.906, 50.341 ] ] }, status: "draft", source: "ai")
  end

  def export(**params)
    get map_geojson_export_path(@map, **params)
    assert_response :success
    JSON.parse(response.body)
  end

  test "exports the boundary and accepted features, without networks nor drafts" do
    sign_in_as users(:bob)
    data = export
    assert_equal "application/geo+json", response.media_type
    assert_match(/attachment; filename="domaine-d-ahinvaux-\d{4}-\d{2}-\d{2}\.geojson"/, response.headers["Content-Disposition"])
    assert_equal "FeatureCollection", data["type"]
    assert_equal %w[boundary pond], data["features"].map { |f| f["properties"]["kind"] }

    pond = data["features"].last
    assert_equal "Mare", pond["properties"]["kind_label"]
    assert_equal "Eau", pond["properties"]["layer_label"]
    assert_in_delta 314, pond["properties"]["area_m2"], 15
    assert_equal "Polygon", pond["geometry"]["type"]
  end

  test "editors may include networks on request" do
    sign_in_as users(:bob)
    pipe = export(networks: "1")["features"].find { |f| f["properties"]["kind"] == "water_pipe" }
    assert pipe
    assert_in_delta 71, pipe["properties"]["length_m"], 2
  end

  test "viewers never get networks" do
    sign_in_as users(:alice)
    kinds = export(networks: "1")["features"].map { |f| f["properties"]["kind"] }
    assert_not_includes kinds, "water_pipe"
  end

  test "strangers get nothing" do
    sign_in_as users(:bob)
    @map.memberships.find_by(user: users(:bob)).destroy!
    get map_geojson_export_path(@map)
    assert_response :not_found
  end
end
