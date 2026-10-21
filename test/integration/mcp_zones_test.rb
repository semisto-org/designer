require "test_helper"
require "test_helpers/mcp_test_helper"

# propose_zones: Terranova draws permaculture zones 1 to 4 around the house
# and lays them as drafts; list_features then tells each element's zone.
class McpZonesTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @house = @map.features.create!(layer: "existing", kind: "building", name: "Maison",
      geometry: { "type" => "Polygon", "coordinates" => [ [ [ 4.9049, 50.33995 ], [ 4.9051, 50.33995 ], [ 4.9051, 50.34005 ], [ 4.9049, 50.34005 ], [ 4.9049, 50.33995 ] ] ] })
  end

  def propose(**args) = call_tool(@owner, "propose_zones", { map_id: @map.id, rationale: "Depuis la maison et ses chemins." }.merge(args))

  test "draws zones around the named house as drafts, then refuses a second set" do
    text, error = propose
    assert error
    assert_match(/house_id/, text, "no dwelling marked and no house named")

    data, error = propose(house_id: @house.id)
    refute error, data
    assert data["created"].any?
    assert_equal false, data["house_marked"]
    zones = MapFeature.find(data["created"].map { |c| c["id"] })
    zones.each do |zone|
      assert_equal [ "notes", "permaculture_zone", "draft", "ai", "Polygon" ], [ zone.layer, zone.kind, zone.status, zone.source, zone.geometry.geometry_type.type_name ]
    end
    assert_includes zones.map { |z| z.properties["zone_number"] }, 1
    assert_equal({ "created" => zones.size, "feature_ids" => zones.map(&:id) }, AiAction.where(tool: "propose_zones").last.result)

    zones.each { |z| z.update!(status: "active") }
    text, error = propose(house_id: @house.id)
    assert error
    assert_match(/déjà des zones/, text)
  end

  test "uses the dwelling when no house is named, and only for editors" do
    @house.update!(properties: @house.properties.merge("dwelling" => true))
    data, error = propose
    refute error, data
    assert data["house_marked"]
    assert_equal [ @house.id ], data["house_ids"]

    _, error = call_tool(personal_token(users(:alice)), "propose_zones", { map_id: @map.id, rationale: "Depuis la maison et ses chemins." })
    assert error
  end
end
