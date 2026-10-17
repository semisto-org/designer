require "test_helper"
require "test_helpers/mcp_test_helper"

# The user's AI reads the fruit stores' readings and notes the ones the
# person gives, directly, like the harvest log.
class McpStorageTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @cellar = @map.features.create!(layer: "structures", kind: "fruit_store", name: "Cave", geometry: point, properties: { "store_type" => "cellar" })
  end

  test "record_storage_readings notes readings, list_storage_readings reads them back with advice" do
    data, error = call_tool(@owner, "record_storage_readings", { map_id: @map.id, readings: [
      { store_id: @cellar.id, measured_on: "2026-05-01", temperature_c: 20, humidity_pct: 60 },
      { store_id: @cellar.id, measured_on: "2026-10-03", temperature_c: 18, humidity_pct: 70 },
      { store_id: @cellar.id, measured_on: "2026-10-04" },
      { store_id: 999_999, measured_on: "2026-10-04", humidity_pct: 80 }
    ] })
    refute error, data
    assert_equal 2, data["created"].size
    assert_equal [ 2, 3 ], data["rejected"].map { _1["index"] }
    assert_equal users(:michael), StorageReading.last.user
    assert_equal({ "created" => 2, "rejected" => 2 }, AiAction.last.result)

    data, error = call_tool(@viewer, "list_storage_readings", { map_id: @map.id })
    refute error
    store = data["stores"].sole
    assert_equal "cellar", store["store_type"]
    assert_equal "2026-10-03", store["readings"].first["measuredOn"]
    assert_equal "bad", store["summary"]["latest"]["verdict"]["overall"]
    assert_equal 0, store["summary"]["winterReadings"]
    assert_equal 2, store["advice"].size
  end

  test "a viewer cannot write" do
    _, error = call_tool(@viewer, "record_storage_readings", { map_id: @map.id, readings: [ { store_id: @cellar.id, measured_on: "2026-10-03", humidity_pct: 80 } ] })
    assert error
    assert_equal 0, StorageReading.count
  end
end
