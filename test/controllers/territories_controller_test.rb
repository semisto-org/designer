require "test_helper"
require "test_helpers/territories_test_helper"

class TerritoriesControllerTest < ActionDispatch::IntegrationTest
  NOMINATIM = "https://nominatim.openstreetmap.org".freeze

  setup do
    Rails.cache.clear
    @member = users(:bob)
    @outsider = users(:alice)
    @team = make_team("Semisto", admin: users(:michael), members: [ @member ])
    @team.grant_territory_module!
  end

  def props = response.parsed_body["props"]

  def stub_yvoir
    row = { "osm_type" => "relation", "osm_id" => 2268384, "lat" => "50.33", "lon" => "4.90", "category" => "boundary", "type" => "administrative",
            "place_rank" => 14, "addresstype" => "village", "name" => "Yvoir", "display_name" => "Yvoir, Dinant, Namur, Wallonie, Belgique",
            "boundingbox" => [ "50.31", "50.36", "4.88", "4.93" ], "geojson" => commune_square }
    stub_request(:get, "#{NOMINATIM}/search").with(query: hash_including(q: "Yvoir")).to_return(status: 200, body: [ row ].to_json, headers: { "Content-Type" => "application/json" })
    stub_request(:get, "#{NOMINATIM}/lookup").with(query: hash_including(osm_ids: "R2268384")).to_return(status: 200, body: [ row ].to_json, headers: { "Content-Type" => "application/json" })
  end

  test "requires sign in" do
    get territories_path
    assert_redirected_to new_session_path
  end

  test "lists my teams' territories and the teams that can open one" do
    make_territory(@team)
    other = make_team("Autre", admin: @outsider)
    other.grant_territory_module!
    make_territory(other, name: "Ciney")
    sign_in_as @member
    get territories_path, headers: inertia_headers
    assert_equal [ "Yvoir" ], props["territories"].map { _1["name"] }
    assert_equal [ "Semisto" ], props["teams"].map { _1["name"] }
  end

  test "searches communes only for a team with the module" do
    stub_yvoir
    sign_in_as @member
    get territory_communes_path(q: "Yvoir")
    assert_equal [ "R2268384" ], response.parsed_body["communes"].map { _1["id"] }

    sign_in_as @outsider
    get territory_communes_path(q: "Yvoir")
    assert_response :forbidden
  end

  test "opens a territory from a commune's name" do
    stub_yvoir
    sign_in_as @member
    assert_difference -> { @team.territories.count } do
      post territories_path, params: { team_id: @team.id, commune_id: "R2268384" }
    end
    territory = @team.territories.last
    assert_redirected_to territory_path(territory)
    assert_equal [ "Yvoir", @member, "R2268384" ], [ territory.name, territory.created_by, territory.boundary_source["id"] ]
    assert_match(/ODbL/, territory.boundary_source["licence"])
  end

  test "a team without the module cannot open a territory" do
    team = make_team("Sans module", admin: @outsider)
    sign_in_as @outsider
    assert_no_difference -> { Territory.count } do
      post territories_path, params: { team_id: team.id, commune_id: "R2268384" }
    end
    assert_redirected_to territories_path
  end

  test "shows the territory to its team only, without sensitive layers" do
    territory = make_territory(@team)
    regions(:wallonia).layers.create!(key: "reseau_eau", name: "Eau", group_name: "réseaux", category: "overlay", kind: "wms", url: "https://example.org/wms", layers: "eau")
    sign_in_as @member
    get territory_path(territory), headers: inertia_headers
    assert_equal "territories/show", response.parsed_body["component"]
    assert props["canEdit"]
    refute_includes props["layers"].map { _1["key"] }, "reseau_eau"

    sign_in_as @outsider
    get territory_path(territory)
    assert_response :not_found
  end

  test "read-only once the module is taken back" do
    territory = make_territory(@team)
    @team.revoke_territory_module!
    sign_in_as @member
    get territory_path(territory), headers: inertia_headers
    refute props["canEdit"]
    patch territory_path(territory), params: { name: "Autre nom" }
    assert_redirected_to territory_path(territory)
    assert_equal "Yvoir", territory.reload.name
  end

  test "writes the notebook's own words" do
    territory = make_territory(@team)
    sign_in_as @member
    patch territory_path(territory), params: { notebook: { next_step: "Marcher le vallon avec les exploitants", other: "x" } }
    assert_equal({ "next_step" => "Marcher le vallon avec les exploitants" }, territory.reload.notebook)
  end

  test "archives and reactivates" do
    territory = make_territory(@team)
    sign_in_as @member
    post archive_territory_path(territory)
    assert territory.reload.archived?
    post unarchive_territory_path(territory)
    refute territory.reload.archived?
  end

  test "the notebook, working or public" do
    territory = make_territory(@team)
    territory.items.create!(kind: "lead", title: "Haie à voir", properties: { land: "public" })
    sign_in_as @member
    get notebook_territory_path(territory), headers: inertia_headers
    assert_equal [ "working", [ "Haie à voir" ] ], [ props["version"], props["hypotheses"].map { _1["title"] } ]
    get notebook_territory_path(territory, version: "public"), headers: inertia_headers
    assert_equal [ "public", [] ], [ props["version"], props["hypotheses"] ]
  end
end
