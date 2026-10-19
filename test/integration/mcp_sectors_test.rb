require "test_helper"
require "test_helpers/mcp_test_helper"

# propose_sectors: an AI names the sectors of a terrain (type and
# directions), Terranova draws their arcs and lays them as drafts.
class McpSectorsTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
  end

  def propose(sectors, **extra)
    call_tool(@owner, "propose_sectors", { map_id: @map.id, sectors: }.merge(extra))
  end

  def winds = { sector_type: "cold_wind", from_deg: 300, to_deg: 40, season: "winter", name: "Vents froids", notes: "Haie brise-vent au nord.", rationale: "Vents de nord-est en hiver d'après le climat observé." }
  def noise = { sector_type: "noise", from_deg: 0, to_deg: 0, rationale: "La personne entend la route de tous côtés." }

  # Bearing from the map's centre, as sectors.ts reads it.
  def bearing(point)
    center = @map.center
    dx = (point[0] - center.x) * Math.cos(center.y * Math::PI / 180)
    dy = point[1] - center.y
    (Math.atan2(dx, dy) * 180 / Math::PI) % 360
  end

  test "lays each sector as a draft arc around the terrain" do
    data, error = propose([ winds, noise ], summary: "Secteurs de l'hiver")
    refute error, data
    assert_equal [ 0, 1 ], data["created"].map { |c| c["index"] }
    assert_empty data["rejected"]
    assert_equal 2, data["pending_drafts"]
    assert_match(/Secteurs/, data["next_step"])

    cold, around = data["created"].map { |c| MapFeature.find(c["id"]) }
    [ cold, around ].each do |feature|
      assert_equal [ "notes", "sector", "draft", "ai" ], [ feature.layer, feature.kind, feature.status, feature.source ]
      assert_equal "LineString", feature.geometry.geometry_type.type_name
    end
    assert_equal({ "sector_type" => "cold_wind", "sector_season" => "winter", "from_deg" => 300, "to_deg" => 40 }, cold.properties.slice("sector_type", "sector_season", "from_deg", "to_deg"))
    assert_equal [ "Vents froids", "Haie brise-vent au nord.", "#6ea2c8" ], [ cold.name, cold.notes, cold.style["color"] ]
    assert_match(/climat observé/, cold.rationale)
    assert_equal({ "sector_type" => "noise", "sector_season" => "all_year", "from_deg" => 0, "to_deg" => 0 }, around.properties.slice("sector_type", "sector_season", "from_deg", "to_deg"))

    # 300 → 40 runs clockwise through the north: 100°, a point every 5°.
    points = cold.geometry.points.map { |p| [ p.x, p.y ] }
    assert_equal 21, points.size
    assert_in_delta 300, bearing(points.first), 0.5
    assert_in_delta 40, bearing(points.last), 0.5
    assert_in_delta 350, bearing(points[10]), 0.5
    # All around: a closed ring of 72 steps.
    ring = around.geometry.points
    assert_equal 73, ring.size
    assert_in_delta 0, bearing([ ring.first.x, ring.first.y ]) % 360, 0.5

    assert_equal [ cold.id, around.id ], AiAction.where(tool: "propose_sectors").sole.result["feature_ids"]
  end

  test "refuses an unknown sector type, and the sun" do
    text, error = propose([ winds.merge(sector_type: "summer_sun") ])
    assert error, text
    assert_equal 0, @map.features.where(kind: "sector").count
  end

  test "only editors with the drafts access can propose sectors" do
    text, error = call_tool(personal_token(users(:alice)), "propose_sectors", { map_id: @map.id, sectors: [ winds ] })
    assert error
    assert_match(/propriétaire et les éditeurs/, text)
  end

  test "the arc goes round the terrain a little outside it" do
    assert_equal 448, Sectors::Arc.radius(@map.bbox)
    assert_equal 60, Sectors::Arc.radius(nil)
    arc = Sectors::Arc.geometry([ 4.9, 50.3 ], 100, 90, 90)
    assert_equal 73, arc["coordinates"].size
    assert_equal 3, Sectors::Arc.geometry([ 4.9, 50.3 ], 100, 10, 12)["coordinates"].size
  end
end
