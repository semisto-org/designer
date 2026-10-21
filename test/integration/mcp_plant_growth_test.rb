require "test_helper"
require "test_helpers/mcp_test_helper"

# An AI reads how a plant grows: the same sizes as the editor's time strip.
class McpPlantGrowthTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @viewer = personal_token(users(:alice))
  end

  test "get_feature gives a plant's growth: adult size, today, and 1, 5, 15, 30 years after planting" do
    apple = @map.features.create!(layer: "plants", kind: "plant", geometry: point,
                                  properties: { "species_id" => plant_species(:apple).id, "planted_on" => "2025-02-01" })
    data, error = call_tool(@viewer, "get_feature", { map_id: @map.id, feature_id: apple.id })
    refute error, data
    growth = data["growth"]
    assert_equal 4.0, growth["adult"]["spread_m"]
    assert_equal "2025-02-01", growth["planted_on"]
    assert growth["today"]["spread_m"].positive?
    assert_equal %w[1 5 15 30], growth["by_age"].keys
    assert_operator growth["by_age"]["30"]["spread_m"], :>, growth["by_age"]["1"]["spread_m"]

    pond = map_features(:pond)
    data, error = call_tool(@viewer, "get_feature", { map_id: @map.id, feature_id: pond.id })
    refute error, data
    refute data.key?("growth")
  end
end
