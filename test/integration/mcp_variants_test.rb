require "test_helper"
require "test_helpers/mcp_test_helper"

# Project variants through the MCP: get_map lists them, list_features reads
# one as the map shows it, propose_features lays drafts in one.
class McpVariantsTest < ActionDispatch::IntegrationTest
  SHAPE = { "type" => "Polygon", "coordinates" => [ [ [ 4.907, 50.341 ], [ 4.9072, 50.341 ], [ 4.9072, 50.3412 ], [ 4.907, 50.341 ] ] ] }.freeze

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @one = @map.variants.create!(name: "Projet 1")
    @two = @map.variants.create!(name: "Projet 2")
    @common = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true })
    @own_two = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true }, variant: @two)
  end

  test "get_map lists the variants with their own elements and the retained one" do
    data, error = call_tool(@owner, "get_map", { map_id: @map.id })
    refute error, data
    list = data["variants"]["list"]
    assert_equal [ "Projet 1", "Projet 2" ], list.map { _1["name"] }
    assert_equal [ true, false ], list.map { _1["retained"] }
    assert_equal [ 0, 1 ], list.map { _1["own_elements"] }
    assert_match "variant_id", data["variants"]["note"]
  end

  test "list_features reads one variant as the map shows it and says each element's variant" do
    data, error = call_tool(@owner, "list_features", { map_id: @map.id, variant_id: @one.id, layer: "water" })
    refute error, data
    ids = data["features"].map { _1["id"] }
    assert_includes ids, @common.id
    assert_not_includes ids, @own_two.id
    data, = call_tool(@owner, "list_features", { map_id: @map.id, variant_id: @two.id, layer: "water" })
    own = data["features"].find { _1["id"] == @own_two.id }
    assert_equal @two.id, own["properties"]["variant_id"]
  end

  test "propose_features lays drafts in a variant, and refuses an unknown one" do
    feature = { layer: "water", kind: "pond", geometry: SHAPE, rationale: "Une mare en bas de la pente, pour la variante 2." }
    data, error = call_tool(@owner, "propose_features", { map_id: @map.id, variant_id: @two.id, features: [ feature ] })
    refute error, data
    assert_equal @two.id, MapFeature.find(data["created"].first["id"]).variant_id
    _, error = call_tool(@owner, "propose_features", { map_id: @map.id, variant_id: 999_999, features: [ feature ] })
    assert error
  end
end
