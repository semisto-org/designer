require "test_helper"
require_relative "../support/map_data_test_helper"
require "test_helpers/mcp_test_helper"
require "test_helpers/territories_test_helper"
require "test_helpers/synthetic_terrain_helper"
require "test_helpers/photo_archive_test_helper"
require "test_helpers/relief_test_helper"

# The tools that read a place (region layers, aerial photos, relief, an
# address) work on a territory too, anywhere in the commune.
class McpTerritoryPlaceTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper
  include SyntheticTerrainHelper
  include PhotoArchiveTestHelper
  include ReliefTestHelper

  ICAR = "https://geoservices.wallonie.be/arcgis/rest/services/DONNEES_BASE/ICAR_ADR_PT/MapServer".freeze

  setup do
    @team = make_team("Semisto", admin: users(:michael), members: [ users(:bob) ])
    @team.grant_territory_module!
    @territory = make_territory(@team)
    @token = personal_token(users(:bob))
    @inside = { lng: YVOIR[:lng] + 0.02, lat: YVOIR[:lat] + 0.02 }
  end

  test "a place is a map or a territory, never both nor neither" do
    text, error = call_tool(@token, "get_region_layers", {})
    assert error
    assert_match(/map_id.*territory_id/, text)
    text, error = call_tool(@token, "get_region_layers", { map_id: maps(:ahinvaux).id, territory_id: @territory.id })
    assert error
    text, error = call_tool(personal_token(users(:alice)), "get_region_layers", { territory_id: @territory.id })
    assert error
    assert_match(/introuvable/, text)
  end

  test "get_region_layers on a territory leaves the networks out" do
    regions(:wallonia).layers.create!(key: "sols", name: "Carte des sols", url: "https://geoservices.example/sols", identify_url: "https://geoservices.example/sols/identify")
    regions(:wallonia).layers.create!(key: "conduites", name: "Conduites", url: "https://geoservices.example/gaz", options: { "sensitive" => true })
    data, error = call_tool(@token, "get_region_layers", { territory_id: @territory.id })
    refute error, data
    assert_equal "wallonia", data.dig("region", "key")
    keys = data["layers"].pluck("key")
    assert_includes keys, "sols"
    assert_not_includes keys, "conduites"
  end

  test "identify_at_point anywhere in the territory, not beyond its margin" do
    seed_wallonia_layers
    # (ReliefTestHelper has its own stub_identify.)
    stub_request(:get, %r{\Ahttps://geoservices\.wallonie\.be/arcgis/rest/services/SOL_SOUS_SOL/CNSW/MapServer/identify}).to_return(json_response("identify_sols.json"))
    data, error = call_tool(@token, "identify_at_point", { territory_id: @territory.id, layers: %w[sols], **@inside })
    refute error, data
    assert_equal "ok", data["results"].sole.dig("result", "status")

    text, error = call_tool(@token, "identify_at_point", { territory_id: @territory.id, lng: 5.5, lat: 50.5 })
    assert error
    assert_match(/territoire/, text)
  end

  test "get_aerial_photo shows the whole commune, or a square around one of its points" do
    seed_wallonia_photos
    stub_photo("ORTHO_1971", jpeg([ 90, 90, 90 ], size: 256))
    data, error = call_tool(@token, "get_aerial_photo", { territory_id: @territory.id, photo: "ortho_1971" })
    refute error, data
    assert_match(/territoire/, data["outline"])
    assert_operator data["extent_m"].first, :>, 3000

    data, error = call_tool(@token, "get_aerial_photo", { territory_id: @territory.id, photo: "ortho_1971", span_m: 300, **@inside })
    refute error, data
    assert_equal [ @inside[:lng], @inside[:lat] ], data["center"]
    assert_in_delta 300, data["extent_m"].first, 5
    west, south, east, north = data["bbox"]
    assert west < @inside[:lng] && @inside[:lng] < east && south < @inside[:lat] && @inside[:lat] < north

    text, error = call_tool(@token, "get_aerial_photo", { territory_id: @territory.id, lng: 5.5, lat: 50.5 })
    assert error
    assert_match(/territoire/, text)
    text, error = call_tool(@token, "get_aerial_photo", { territory_id: @territory.id, span_m: 300 })
    assert error
    assert_match(/span_m/, text)
  end

  test "a map's aerial photo can look closer around a point too" do
    seed_wallonia_photos
    stub_photo("ORTHO_1971", jpeg([ 90, 90, 90 ], size: 256))
    viewer = personal_token(users(:alice))
    data, error = call_tool(viewer, "get_aerial_photo", { map_id: maps(:ahinvaux).id, photo: "ortho_1971", lng: 4.907, lat: 50.341, span_m: 150 })
    refute error, data
    assert_in_delta 150, data["extent_m"].first, 5
  end

  test "get_catchment on a territory prepares its relief, then traces the catchment of a point" do
    configure_relief_region
    text, error = nil
    assert_enqueued_with(job: ReliefImportJob) do
      text, error = call_tool(@token, "get_catchment", { territory_id: @territory.id, **@inside })
    end
    assert error
    assert_match(/se prépare/, text)
    assert_equal "pending", @territory.reload.terrain.status

    # While it runs, no second import.
    assert_no_enqueued_jobs(only: ReliefImportJob) { call_tool(@token, "get_catchment", { territory_id: @territory.id, **@inside }) }

    synthetic_terrain(@territory, cell_size_m: 20, margin_m: 200) { |_dx, dy| 200 + dy * 0.02 }
    data, error = call_tool(@token, "get_catchment", { territory_id: @territory.id, **@inside })
    refute error, data
    assert data["area_m2"].positive?
    assert_equal 20.0, data["cell_size_m"]
    assert_match(/grossier/, data["note"])

    text, error = call_tool(@token, "get_catchment", { territory_id: @territory.id, feature_id: 1 })
    assert error
    assert_match(/lng et lat/, text)
  end

  test "get_catchment on a territory of a region without relief says so" do
    text, error = call_tool(@token, "get_catchment", { territory_id: @territory.id, **@inside })
    assert error
    assert_match(/pas encore de relief/, text)
  end

  test "geocode asks Wallonia's address register and says whether the address is in the territory" do
    regions(:wallonia).update!(settings: regions(:wallonia).settings.merge("geocoder" => { "provider" => "icar", "icar" => { "url" => ICAR } }))
    stub_request(:get, %r{\A#{Regexp.escape(ICAR)}/1/query}).to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: {
      features: [
        { attributes: { ADR_NUMERO: "1", RUE_NM: "Rue du Moulin", CODE_POSTAL: "5530", COM_NM: "Yvoir" }, geometry: { x: @inside[:lng], y: @inside[:lat] } },
        { attributes: { ADR_NUMERO: "1", RUE_NM: "Rue du Moulin", CODE_POSTAL: "5500", COM_NM: "Dinant" }, geometry: { x: 4.95, y: 50.2 } }
      ]
    }.to_json)

    data, error = call_tool(@token, "geocode", { address: "Rue du Moulin 1", territory_id: @territory.id })
    refute error, data
    yvoir, dinant = data["results"]
    assert_equal [ "Rue du Moulin 1, 5530 Yvoir", true, 0 ], yvoir.values_at("label", "inside", "distance_m")
    assert_equal false, dinant["inside"]
    assert_operator dinant["distance_m"], :>, 5000
    assert_equal "geocode", AiAction.last.tool
  end

  test "geocode without a place: OpenStreetMap, then the register of the region it lands in" do
    regions(:wallonia).update!(settings: regions(:wallonia).settings.merge("geocoder" => { "provider" => "icar", "icar" => { "url" => ICAR } }))
    stub_request(:get, /nominatim/).to_return(json_response("nominatim_search.json"))
    icar = stub_request(:get, %r{\A#{Regexp.escape(ICAR)}/1/query}).to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: {
      features: [ { attributes: { ADR_NUMERO: "3", RUE_NM: "Rue du Bois", CODE_POSTAL: "5530", COM_NM: "Yvoir" }, geometry: { x: 4.8801, y: 50.3289 } } ]
    }.to_json)

    data, error = call_tool(@token, "geocode", { address: "Rue du Bois 3 Yvoir" })
    refute error, data
    assert_requested icar
    assert_equal "Rue du Bois 3, 5530 Yvoir", data["results"].first["label"]
    assert_nil data["results"].first["inside"]
  end

  test "get_hydrography reads the region's water layers, or says they are not there" do
    text, error = call_tool(@token, "get_hydrography", { territory_id: @territory.id })
    assert error
    assert_match(/ne publie pas encore/, text)

    eau = "https://geoservices.wallonie.be/arcgis/rest/services/EAU"
    regions(:wallonia).update!(settings: regions(:wallonia).settings.merge("hydrography" => {
      "attribution" => "SPW (test)",
      "watercourses" => { "url" => "#{eau}/LIDAXES/MapServer", "layers" => [ 6 ], "category_field" => "CATEG", "name_fields" => %w[NOMB NOMA],
                          "categories" => { "01" => { "key" => "category_1", "manager" => "Région wallonne" } } }
    }))
    stub = stub_request(:get, %r{#{eau}/LIDAXES/MapServer/6/query}).to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: {
      type: "FeatureCollection",
      features: [ { type: "Feature", properties: { CATEG: "01", NOMB: "Le", NOMA: "BOCQ" },
                    geometry: { type: "LineString", coordinates: [ [ 4.87, 50.33 ], [ 4.94, 50.33 ] ] } } ]
    }.to_json)
    data, error = call_tool(@token, "get_hydrography", { territory_id: @territory.id, outlines: false })
    refute error, data
    assert_requested stub
    assert_equal [ "Le Bocq", "category_1", "Région wallonne" ], data["watercourses"].sole.values_at("name", "category", "manager")
    assert_equal [], data["sub_basins"]
    assert_match(/administration/, data["note"])
    assert_equal "get_hydrography", AiAction.last.tool

    Rails.cache.clear
    stub_request(:get, %r{#{eau}/LIDAXES/MapServer/6/query}).to_return(status: 503)
    text, error = call_tool(@token, "get_hydrography", { territory_id: @territory.id })
    assert error
    assert_match(/ne répond pas/, text)
  end
end
