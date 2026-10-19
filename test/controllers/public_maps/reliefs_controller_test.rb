require "test_helper"
require_relative "../../test_helpers/relief_test_helper"

class PublicMaps::ReliefsControllerTest < ActionDispatch::IntegrationTest
  include ReliefTestHelper

  setup do
    configure_relief_region
    @map = small_map
    @map.features.create!(layer: "plants", kind: "plant", name: "Le pommier de Lily", geometry: point(lng: 4.9001, lat: 50.3401),
                          properties: { "species_id" => plant_species(:apple).id, "number" => 7 })
    @map.features.create!(layer: "water", kind: "pond", name: "Mare", geometry: square(lng: 4.9002, lat: 50.3402, size: 0.00005),
                          properties: { "depth_m" => 1.4, "secret" => "x" })
  end

  def publish(**options) = MapPublication.publish!(@map, by: users(:michael), **options)

  def import_terrain
    stub_spw
    Relief::TerrainImport.new(@map.create_terrain!, provider: instant_provider).call
  end

  test "no 3D on a public map before the terrain's relief is imported" do
    publication = publish
    get public_map_path(publication.token), headers: inertia_headers
    assert_nil response.parsed_body.dig("props", "reliefPath")
    get public_map_relief_path(publication.token)
    assert_response :not_found
  end

  test "without an account: the 3D page, its files and buildings, from the snapshot" do
    import_terrain
    publication = publish
    get public_map_path(publication.token), headers: inertia_headers
    assert_equal "/p/#{publication.token}/3d", response.parsed_body.dig("props", "reliefPath")

    get public_map_relief_path(publication.token), headers: inertia_headers
    assert_response :success
    body = response.parsed_body
    assert_equal "public_maps/relief", body["component"]
    props = body["props"]
    assert_nil props["currentUser"]
    assert_match(/noindex/, response.headers["X-Robots-Tag"])
    pond = props["features"].find { |f| f.dig("properties", "kind") == "pond" }
    assert_equal 1.4, pond.dig("properties", "depth_m"), "the 3D digs the pond to its depth"
    assert_nil pond.dig("properties", "secret")
    plant = props.dig("growingPlants", "plants", 0)
    assert_equal 7, plant["number"].to_i
    assert_nil plant["ownName"]
    assert_empty props.dig("soilModel", "measurements")

    grid_url = props.dig("terrain", "files", "grid")
    assert_match %r{\A/p/#{publication.token}/3d/files/grid\?v=}, grid_url
    get grid_url
    assert_response :success
    assert_equal "application/octet-stream", response.media_type

    stub_request(:get, %r{overpass}).to_return(status: 200, body: { elements: [] }.to_json)
    get props["buildingsUrl"]
    assert_response :success
  end

  test "an unpublished map has no 3D either" do
    import_terrain
    publication = publish
    publication.unpublish!
    get public_map_relief_path(publication.token)
    assert_response :gone
    get public_map_relief_file_path(publication.token, "grid")
    assert_response :gone
  end
end
