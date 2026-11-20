require "test_helper"
require "test_helpers/synthetic_terrain_helper"
require "test_helpers/mcp_test_helper"

# The height of the trees already on the land, read from the relief's
# surface model minus its terrain model.
class Relief::TreeHeightsTest < ActionDispatch::IntegrationTest
  include SyntheticTerrainHelper

  setup do
    @map = Map.create!(name: "Ahinvaux", owner: users(:michael), region: regions(:wallonia))
    @map.update!(boundary: square(lng: 4.9, lat: 50.34, size: 0.0006))
    @terrain = synthetic_terrain(@map, margin_m: 4) { |_dx, dy| 200 + dy * 0.05 }
    centre = @map.boundary.centroid
    @lng, @lat = centre.x, centre.y
  end

  # A surface model: the ground, 0.3 m of grass, and a crown of `top` metres
  # within `radius` metres of the boundary's centre.
  def surface!(top: 18.0, radius: 4.0, cell_size_m: nil)
    cx, cy = Relief::Mercator.forward(@lng, @lat)
    scale = Math.cos(@terrain.lat0 * Math::PI / 180)
    heights = Array.new(@terrain.rows * @terrain.cols) do |i|
      r, c = i.divmod(@terrain.cols)
      dx = (@terrain.west + c * @terrain.step - cx) * scale
      dy = (@terrain.north - r * @terrain.step - cy) * scale
      ground = 200 + dy * 0.05
      ground + (Math.hypot(dx, dy) <= radius ? top - Math.hypot(dx, dy) * 0.5 : 0.3)
    end
    packed = Relief::Raster.pack_heights(heights)
    @terrain.surface.attach(io: StringIO.new(packed.bytes), filename: "surface.bin", content_type: "application/octet-stream", identify: false)
    @terrain.update!(cell_size_m: cell_size_m || @terrain.cell_size_m,
                     metadata: { "surface" => { "z_min" => packed.z_min, "z_max" => packed.z_max, "z_unit" => 0.01 },
                                 "sources" => { "surface" => "SPW, MNS LiDAR 2021-2022" } })
  end

  test "a tree's height is the top of its crown above the ground under it" do
    surface!
    heights = Relief::TreeHeights.new(@map)
    assert heights.available?
    assert_equal "SPW, MNS LiDAR 2021-2022", heights.source
    assert_in_delta 18.0, heights.at(@lng, @lat, crown_m: 8), 0.5
    tree = @map.features.create!(layer: "existing", kind: "existing_tree", geometry: point(lng: @lng, lat: @lat), properties: { "crown_diameter_m" => 8 })
    assert_equal [ tree.id ], heights.for_features([ tree ]).keys
  end

  test "grass is not a tree, and a coarse or missing surface model says nothing" do
    surface!(top: 1.0)
    assert_nil Relief::TreeHeights.new(@map).at(@lng, @lat)
    surface!(cell_size_m: 30)
    refute Relief::TreeHeights.new(@map).available?
    @terrain.surface.purge
    refute Relief::TreeHeights.new(@map.reload).available?
  end

  test "the editor and the MCP read the heights of the map's existing trees" do
    surface!
    tree = @map.features.create!(layer: "existing", kind: "existing_tree", geometry: point(lng: @lng, lat: @lat), properties: { "crown_diameter_m" => 8 })
    sign_in_as users(:michael)
    get map_tree_heights_path(@map, format: :json)
    assert_response :success
    body = response.parsed_body
    assert body["available"]
    assert_in_delta 18.0, body["heights"][tree.id.to_s], 0.5

    data, error = call_tool(personal_token(users(:michael)), "get_feature", { map_id: @map.id, feature_id: tree.id })
    refute error, data
    assert_in_delta 18.0, data["height_from_above"]["height_m"], 0.5
    assert_equal "SPW, MNS LiDAR 2021-2022", data["height_from_above"]["source"]
  end
end
