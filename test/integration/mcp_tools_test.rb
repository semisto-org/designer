require "test_helper"
require_relative "../support/map_data_test_helper"
require "test_helpers/mcp_test_helper"
require "test_helpers/synthetic_terrain_helper"
require "test_helpers/soil_photos_helper"

class McpToolsTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper
  include SyntheticTerrainHelper
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @stranger = personal_token(users(:bob))
    @pipe = @map.features.create!(layer: "networks", kind: "water_pipe", name: "Conduite",
      geometry: { "type" => "LineString", "coordinates" => [ [ 4.904, 50.3401 ], [ 4.906, 50.3401 ] ] })
  end

  test "list_maps returns the maps the user can open, with their role" do
    data, error = call_tool(@owner, "list_maps")
    refute error
    map = data["maps"].sole
    assert_equal [ @map.id, "owner", "http://www.example.com/maps/#{@map.id}" ], map.values_at("id", "role", "url")

    data, = call_tool(@viewer, "list_maps")
    assert_equal "viewer", data["maps"].sole["role"]
    data, = call_tool(@stranger, "list_maps")
    assert_empty data["maps"]
    assert_equal({ "maps" => 0 }, AiAction.last.result)
  end

  test "get_map gives the boundary, parcels, project sheet and what the connection may do" do
    @map.update!(project: { "goals" => [ "Autonomie fruitière" ] }, parcels: [ "91034A0123/00B000" ])
    data, error = call_tool(@owner, "get_map", { map_id: @map.id })
    refute error
    assert_equal "MultiPolygon", data.dig("boundary", "type")
    assert_equal [ "Autonomie fruitière" ], data.dig("project", "goals")
    assert_equal [ "91034A0123/00B000" ], data["parcels"]
    assert_equal 2, data["centroid"].size
    assert data["area_m2"].positive?
    assert data.dig("permissions", "propose_drafts")
    assert_equal 1, data.dig("elements", "by_layer", "networks", "active")
    assert_equal "Zone", data.dig("known_kinds", "zone")
    assert_equal [], data.dig("implementation", "phases")
    assert_equal AiAction.last.map, @map

    data, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_nil data.dig("elements", "by_layer", "networks"), "networks are hidden from viewers"
    refute data.dig("permissions", "propose_drafts")

    text, error = call_tool(@stranger, "get_map", { map_id: @map.id })
    assert error
    assert_match(/introuvable/, text)
    assert_nil AiAction.last.map, "no journal entry on a map the user cannot open"
  end

  test "get_map gives the sector analysis, sun included, and the links to print the design" do
    @map.features.create!(layer: "notes", kind: "sector", geometry: Sectors::Arc.for_map(@map, from_deg: 300, to_deg: 40),
      name: "Bise", properties: { "sector_type" => "cold_wind", "sector_season" => "winter", "from_deg" => 300, "to_deg" => 40 })
    data, error = call_tool(@viewer, "get_map", { map_id: @map.id })
    refute error
    sun = data.dig("sectors", "sun").to_h { [ _1["type"], _1 ] }
    assert_operator sun.dig("summer_sun", "from_deg"), :<, 90
    assert_match(/\Ade (NE|ENE) à (NO|ONO)\z/, sun.dig("summer_sun", "directions"))
    sector = data.dig("sectors", "drawn").sole
    assert_equal [ "cold_wind", "winter", 300.0, 40.0, "de ONO à NE", "Bise" ], sector.values_at("sector_type", "season", "from_deg", "to_deg", "directions", "name")
    assert_equal "http://www.example.com/maps/#{@map.id}?export=book", data.dig("exports", "book_pdf_url")
    assert_equal "http://www.example.com/maps/#{@map.id}/dossier", data.dig("exports", "dossier_url")
  end

  test "get_map tells the owner about the public view and what it brought, never the others" do
    data, = call_tool(@owner, "get_map", { map_id: @map.id })
    refute data.dig("publication", "published")
    assert_match(/Publier/, data.dig("publication", "note"))

    publication = MapPublication.publish!(@map, by: users(:michael), title: "Le verger")
    publication.update!(views_count: 31)
    MapTrial.create!(center: "POINT(4.9 50.3)", source_publication: publication)
    users(:bob).update!(source_publication: publication)
    @map.touch

    data, = call_tool(@owner, "get_map", { map_id: @map.id })
    shown = data["publication"]
    assert shown["published"]
    assert shown["stale"], "the map changed since the snapshot"
    assert_equal "http://www.example.com#{publication.public_path}", shown["url"]
    assert_equal [ 31, 1, 1 ], shown.values_at("views", "places_tried", "gardens_started")
    refute shown.to_s.include?("bob"), "numbers, never names"

    data, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_nil data["publication"]
  end

  test "get_map gives the offer's versions and the accepted budget, to the team only" do
    data, = call_tool(@owner, "get_map", { map_id: @map.id })
    assert_nil data["offer"], "a personal account never sees an offer"

    users(:michael).update!(account_kind: "professional")
    offer = Offer.build_for(@map)
    offer.inputs = offer.inputs.merge("scope" => [ { "label" => "Jardin-forêt", "planting_type" => "forest_garden", "measure" => 2_000 } ])
    offer.save!
    offer.save_version!(user: users(:michael)).update!(status: "sent")
    accepted = offer.save_version!(user: users(:michael), note: "Signée")
    accepted.update!(status: "accepted")

    data, error = call_tool(@owner, "get_map", { map_id: @map.id })
    refute error
    assert_equal "http://www.example.com/maps/#{@map.id}/offer", data.dig("offer", "url")
    assert_equal [ %w[V1 sent], %w[V2 accepted] ], data.dig("offer", "versions").map { _1.values_at("label", "status") }
    budget = data.dig("offer", "accepted")
    totals = accepted.result["totals"]
    assert_equal [ 2, "Signée", totals["total_tvac"] ], budget.values_at("number", "note", "total_tvac")
    assert budget["total_htva"].positive?
    assert_operator budget["total_htva"], :<, budget["total_tvac"]
    assert_in_delta budget["total_htva"], budget["services_htva"] + budget["plants_supplies_htva"], 0.02
    assert_in_delta totals["services_price_tvac"] / 1.21, budget["services_htva"], 0.01
    assert budget["hours_max"] >= budget["hours_min"]
    assert budget["hours_min"].positive?

    data, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_nil data["offer"], "a viewer (maybe the client) never sees the offer"
  end

  test "get_map counts the palette like its table: planted, still to plant, its price and what is left to buy" do
    apple = plant_species(:apple)
    apple.update!(invasive_countries: [ "BE" ])
    @map.palette_items.create!(species: apple, unit_price: 10)
    spot = { "type" => "Point", "coordinates" => [ 4.905, 50.3402 ] }
    @map.features.create!(layer: "plants", kind: "plant", geometry: spot, properties: { "species_id" => apple.id })
    @map.features.create!(layer: "plants", kind: "plant", geometry: spot, properties: { "species_id" => apple.id, "planted_on" => "2025-11-15" })

    data, error = call_tool(@owner, "get_map", { map_id: @map.id })
    refute error
    entry = data["palette"].find { _1["species_id"] == apple.id }
    assert_equal [ 2, 1, 1, 10.0 ], entry.values_at("planned", "planted", "to_plant", "unit_price_eur")
    assert_equal "invasive", entry["excluded_by"]
    assert_equal({ "to_buy_eur" => 10.0, "total_eur" => 20.0 }, data["palette_budget"])
  end

  test "get_map gives the bio-indicator plants noted on the terrain and what they point to" do
    @map.bioindicator_observations.create!(catalog_key: "ortie", abundance: "dominant", location: [ 4.906, 50.341 ])
    data, error = call_tool(@viewer, "get_map", { map_id: @map.id })
    refute error
    nettle = data.dig("bioindicators", "observations").first
    assert_equal "Ortie dioïque", nettle["name"]
    assert_equal [ 4.906, 50.341 ], nettle["location"]
    assert_includes nettle["indicators"], "nitrogen_rich"
    assert_nil nettle["photo_id"]
    assert_includes data.dig("bioindicators", "summary").map { |row| row["key"] }, "nitrogen_rich"
  end

  test "get_design_guide lists the chapters, then serves one" do
    data, error = call_tool(@viewer, "get_design_guide")
    refute error
    assert_equal "method", data["start_with"]
    assert_equal DesignGuide.topics, data["chapters"].map { |c| c["topic"] }
    assert_nil AiAction.last.map

    data, error = call_tool(@viewer, "get_design_guide", { topic: "water" })
    refute error
    assert_equal "water", data["topic"]
    assert_match(/contour/, data["guide"])
    refute_includes data["other_chapters"].map { |c| c["topic"] }, "water"
    assert_equal({ "topic" => "water" }, AiAction.last.result)

    text, error = call_tool(@viewer, "get_design_guide", { topic: "nope" })
    assert error, "an unknown topic is refused by the schema or the tool"
    assert text.present?
  end

  test "get_help lists the guides, searches them and serves one with absolute links" do
    data, error = call_tool(@viewer, "get_help")
    refute error
    assert_includes data["guides"].map { |g| g["slug"] }, "connecter-son-ia"

    data, = call_tool(@viewer, "get_help", { query: "baisière" })
    assert_includes data["guides"].map { |g| g["slug"] }, "tracer-sur-la-courbe-et-le-keyline"
    assert data["guides"].first["excerpt"].present?

    data, error = call_tool(@viewer, "get_help", { slug: "le-soleil-et-l-horizon" })
    refute error
    assert_equal "le-soleil-et-l-horizon", data["slug"]
    assert_match %r{/help/le-soleil-et-l-horizon\z}, data["url"]
    assert_includes data["guide"], "**Ouvrir le panneau Soleil** (un bouton du guide"
    refute_includes data["guide"], "action:panel"
    refute_match %r{\]\(/}, data["guide"]
    assert_equal({ "slug" => "le-soleil-et-l-horizon" }, AiAction.last.result)

    text, error = call_tool(@viewer, "get_help", { slug: "nope" })
    assert error
    assert_match(/introuvable/, text)
  end

  test "the server instructions send the agent to the design guide" do
    body = mcp_request(@viewer, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } })
    assert_match(/get_design_guide/, body.dig("result", "instructions"))
  end

  test "list_features filters and hides networks unless an editor asks" do
    data, = call_tool(@owner, "list_features", { map_id: @map.id })
    assert_equal [ "pond" ], data["features"].map { |f| f.dig("properties", "kind") }
    assert_equal "hidden", data["networks"]

    data, = call_tool(@owner, "list_features", { map_id: @map.id, include_networks: true })
    assert_equal %w[pond water_pipe], data["features"].map { |f| f.dig("properties", "kind") }.sort

    data, = call_tool(@viewer, "list_features", { map_id: @map.id, include_networks: true })
    assert_equal [ "pond" ], data["features"].map { |f| f.dig("properties", "kind") }
    assert_match(/éditeurs/, data["note"])

    data, = call_tool(@owner, "list_features", { map_id: @map.id, layer: "plants" })
    assert_empty data["features"]
    data, = call_tool(@owner, "list_features", { map_id: @map.id, bbox: [ 4.9049, 50.3399, 4.9053, 50.3403 ] })
    assert_equal 1, data["count"]
    data, = call_tool(@owner, "list_features", { map_id: @map.id, bbox: [ 5.0, 50.0, 5.1, 50.1 ] })
    assert_equal 0, data["count"]
    text, error = call_tool(@owner, "list_features", { map_id: @map.id, bbox: [ 5.1, 50.0, 5.0, 50.1 ] })
    assert error
    assert_match(/bbox/, text)
  end

  test "list_features says which plants are support plants, from their palette role or their sheet" do
    @map.palette_items.create!(species: plant_species(:alder), role: "support")
    alder = @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.906),
                                  properties: { "species_id" => plant_species(:alder).id, "support_until" => 8, "training" => "chop_and_drop" })
    apple = @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9061),
                                  properties: { "species_id" => plant_species(:apple).id })
    kept = @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.9062),
                                 properties: { "species_id" => plant_species(:alder).id, "succession" => "productive" })
    data, = call_tool(@owner, "list_features", { map_id: @map.id, layer: "plants" })
    by_id = data["features"].index_by { |f| f["id"] }
    assert_equal true, by_id[alder.id].dig("properties", "support")
    assert_equal 8, by_id[alder.id].dig("properties", "support_until")
    assert_nil by_id[apple.id].dig("properties", "support")
    assert_nil by_id[kept.id].dig("properties", "support")
  end

  test "list_features paginates with after_id and can drop geometries" do
    3.times { |i| @map.features.create!(layer: "plants", kind: "tree", name: "Arbre #{i}", geometry: point(lng: 4.906 + i * 0.0001)) }
    data, = call_tool(@owner, "list_features", { map_id: @map.id, layer: "plants", limit: 2, include_geometry: false })
    assert_equal 2, data["count"]
    assert_equal 3, data["total"]
    assert_nil data["features"].first["geometry"]
    data, = call_tool(@owner, "list_features", { map_id: @map.id, layer: "plants", limit: 2, after_id: data["next_after_id"] })
    assert_equal [ "Arbre 2" ], data["features"].map { |f| f.dig("properties", "name") }
    assert_nil data["next_after_id"]
  end

  test "get_feature returns measures, and hides networks from viewers" do
    data, error = call_tool(@viewer, "get_feature", { map_id: @map.id, feature_id: map_features(:pond).id })
    refute error
    assert_in_delta 316, data.dig("measures", "area_m2"), 30
    assert_equal "Mare du verger", data.dig("properties", "name")

    _, error = call_tool(@viewer, "get_feature", { map_id: @map.id, feature_id: @pipe.id })
    assert error
    _, error = call_tool(@owner, "get_feature", { map_id: @map.id, feature_id: @pipe.id })
    refute error
  end

  test "list_features and get_feature tell each element's permaculture zone" do
    data, = call_tool(@owner, "list_features", { map_id: @map.id })
    assert_nil data["features"].sole.dig("properties", "permaculture_zone"), "no zone before any is drawn"

    pond = map_features(:pond)
    ring = [ [ 4.9, 50.336 ], [ 4.91, 50.336 ], [ 4.91, 50.344 ], [ 4.9, 50.344 ], [ 4.9, 50.336 ] ]
    zone = @map.features.create!(layer: "notes", kind: "permaculture_zone", properties: { "zone_number" => 3 }, geometry: { "type" => "Polygon", "coordinates" => [ ring ] })
    data, = call_tool(@owner, "list_features", { map_id: @map.id })
    by_id = data["features"].index_by { |f| f["id"] }
    assert_equal 3, by_id[pond.id].dig("properties", "permaculture_zone")
    assert_equal 3, by_id[zone.id].dig("properties", "zone_number")
    assert_nil by_id[zone.id].dig("properties", "permaculture_zone")

    data, = call_tool(@viewer, "get_feature", { map_id: @map.id, feature_id: pond.id })
    assert_equal 3, data.dig("properties", "permaculture_zone")
  end

  test "get_region_layers lists the region catalogue" do
    regions(:wallonia).layers.create!(key: "sols", name: "Carte des sols", url: "https://geoservices.example/sols", identify_url: "https://geoservices.example/sols/identify",
                                      options: { legend: { items: [ { label: "Ravin", color: "#000000", shape: "line" } ] } })
    data, error = call_tool(@viewer, "get_region_layers", { map_id: @map.id })
    refute error
    assert_equal [ [ "sols", true ] ], data["layers"].map { |l| [ l["key"], l["identifiable"] ] }
    assert_equal "Ravin", data["layers"].sole.dig("legend", "items", 0, "label")
    assert_equal "wallonia", data.dig("region", "key")
  end

  test "identify_at_point asks the region layers, near the terrain only" do
    seed_wallonia_layers
    stub_identify("SOL_SOUS_SOL/CNSW", "identify_sols.json")
    data, error = call_tool(@owner, "identify_at_point", { map_id: @map.id, lng: 4.907, lat: 50.341, layers: %w[sols] })
    refute error
    assert_equal "ok", data["results"].sole.dig("result", "status")

    text, error = call_tool(@owner, "identify_at_point", { map_id: @map.id, lng: 5.5, lat: 50.5 })
    assert error
    assert_match(/1000 m/, text)
  end

  test "identify_at_point reports a layer whose service does not answer" do
    seed_wallonia_layers
    stub_request(:get, SPW_REST).to_return(status: 503)
    data, error = call_tool(@owner, "identify_at_point", { map_id: @map.id, lng: 4.907, lat: 50.341, layers: %w[sols] })
    refute error
    assert_match(/pas encore disponible/, data["results"].sole["error"])
  end

  test "trace_contour gives the contour line through a point, or asks for the relief" do
    centre = @map.boundary.centroid
    text, error = call_tool(@viewer, "trace_contour", { map_id: @map.id, lng: centre.x, lat: centre.y })
    assert error
    assert_match(/Eau et relief/, text)

    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    data, error = call_tool(@viewer, "trace_contour", { map_id: @map.id, lng: centre.x, lat: centre.y })
    refute error
    assert_equal "LineString", data.dig("geometry", "type")
    assert_in_delta 200, data["elevation_m"], 0.05
    assert data["length_m"].positive?
    assert_equal 1.0, data["cell_size_m"]
    assert_equal "trace_contour", AiAction.last.tool
  end

  test "get_catchment gives what drains into a pond or a point" do
    centre = @map.boundary.centroid
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    pond = @map.features.create!(layer: "water", kind: "pond", properties: { "depth_m" => 1 },
      geometry: { "type" => "Polygon", "coordinates" => [ [ [ -1, -1 ], [ 1, -1 ], [ 1, 1 ], [ -1, 1 ], [ -1, -1 ] ].map { |x, y| [ centre.x + x * 0.00003, centre.y + y * 0.00002 ] } ] })

    data, error = call_tool(@viewer, "get_catchment", { map_id: @map.id, feature_id: pond.id })
    refute error
    assert data["area_m2"].positive?
    assert data["beyond_relief"]
    assert_includes %w[Polygon MultiPolygon], data.dig("geometry", "type")
    assert_equal "get_catchment", AiAction.last.tool

    data, error = call_tool(@viewer, "get_catchment", { map_id: @map.id, lng: centre.x, lat: centre.y })
    refute error
    assert_equal [ centre.x, centre.y ], data["point"]

    text, error = call_tool(@viewer, "get_catchment", { map_id: @map.id })
    assert error
    assert_match(/feature_id/, text)
  end

  test "find_keypoints gives the keypoints of the valleys with their keylines" do
    synthetic_terrain(@map) { |dx, dy| 200 + dx.abs * 0.15 + (dy.positive? ? dy * 0.10 : dy * 0.02) }
    data, error = call_tool(@viewer, "find_keypoints", { map_id: @map.id })
    refute error
    keypoint = data["keypoints"].sole
    assert_operator keypoint["slope_above_pct"], :>, keypoint["slope_below_pct"]
    assert_equal "LineString", keypoint.dig("keyline", "geometry", "type")
    assert_equal "find_keypoints", AiAction.last.tool
  end

  test "trace_parallels gives the lines above and below a keyline" do
    centre = @map.boundary.centroid
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    keyline = @map.features.create!(layer: "water", kind: "keyline", properties: { "role" => "keyline", "use" => "trees" },
      geometry: { "type" => "LineString", "coordinates" => [ [ centre.x - 0.0002, centre.y ], [ centre.x + 0.0002, centre.y ] ] })
    data, error = call_tool(@viewer, "trace_parallels", { map_id: @map.id, feature_id: keyline.id, spacing_m: 5, above: 1, below: 1 })
    refute error
    assert_equal %w[above below], data["lines"].map { |l| l["side"] }
    assert_equal "trace_parallels", AiAction.last.tool
  end

  test "get_storm_observations says what the person saw under the rain and what the relief makes of it" do
    centre = @map.boundary.centroid
    synthetic_terrain(@map) { |_dx, dy| 200 + dy * 0.1 }
    flow = @map.features.create!(layer: "water", kind: "storm_observation", notes: "Ruisselle depuis le chemin",
      properties: { "rain" => "storm", "muddy" => true, "observed_at" => "2026-02-03T14:20:00Z" },
      geometry: { "type" => "LineString", "coordinates" => [ [ centre.x, centre.y + 0.0001 ], [ centre.x, centre.y - 0.0001 ] ] })
    data, error = call_tool(@viewer, "get_storm_observations", { map_id: @map.id })
    refute error
    observation = data["observations"].sole
    assert_equal [ flow.id, "flows", "storm", true, "2026-02-03T14:20:00Z" ], observation.values_at("id", "water", "rain", "muddy", "observed_at")
    assert_includes %w[follows diverges], observation.dig("relief", "verdict")
    assert_equal "get_storm_observations", AiAction.last.tool
  end

  test "get_element_functions gives what each element does and which functions only one serves" do
    @map.features.create!(layer: "structures", kind: "compost", geometry: { type: "Point", coordinates: [ 4.9051, 50.3401 ] })
    data, error = call_tool(@viewer, "get_element_functions", { map_id: @map.id })
    refute error
    compost = data["entries"].find { |e| e["kind"] == "compost" }
    assert_equal %w[fertility], compost["functions"]
    assert_includes data["unmet_needs"].map { |n| n["resource"] }, "organic_matter"
    assert_equal "fragile", data["balance"].find { |b| b["function"] == "fertility" }["status"]
    assert_equal "get_element_functions", AiAction.last.tool
  end

  test "get_season_signs gives the season signs, their days per year and the seasons not yet observed" do
    travel_to Time.utc(2026, 10, 19, 12) do
      centre = @map.boundary.centroid
      at = { "type" => "Point", "coordinates" => [ centre.x, centre.y ] }
      frost = @map.features.create!(layer: "notes", kind: "season_sign", name: "Premier gel", notes: "Givre sur le bas de la prairie",
        properties: { "sign" => "first_frost", "observed_at" => "2026-10-12T07:00:00Z" }, geometry: at)
      @map.features.create!(layer: "notes", kind: "season_sign", properties: { "sign" => "first_frost", "observed_at" => "2025-10-10T07:00:00Z" }, geometry: at)
      @map.features.create!(layer: "notes", kind: "season_sign", properties: { "sign" => "nest", "observed_at" => "2026-04-20T09:00:00Z" }, geometry: at)
      @map.features.create!(layer: "notes", kind: "note_point", properties: { "visit" => SecureRandom.uuid, "taken_at" => "2026-02-03T10:00:00Z" }, geometry: at)

      data, error = call_tool(@viewer, "get_season_signs", { map_id: @map.id })
      refute error
      assert_equal [ frost.id, "first_frost", "2026-10-12T07:00:00Z", "Givre sur le bas de la prairie" ], data["signs"].first.values_at("id", "sign", "observed_at", "notes")
      frosts = data["by_sign"].find { |line| line["sign"] == "first_frost" }
      assert_equal [ { "year" => 2025, "first" => "2025-10-10", "last" => "2025-10-10", "count" => 1 }, { "year" => 2026, "first" => "2026-10-12", "last" => "2026-10-12", "count" => 1 } ], frosts["years"]
      assert_equal({ "winter" => 1, "spring" => 1, "summer" => 0, "autumn" => 1 }, data.dig("year", "seasons"))
      assert_equal [ "summer" ], data.dig("year", "missing")
      assert_equal "get_season_signs", AiAction.last.tool

      data, error = call_tool(@viewer, "get_map", { map_id: @map.id })
      refute error
      assert_equal [ "summer" ], data.dig("observation_year", "missing")
    end
  end

  test "plant tools search the catalogue and give a species with its provenance" do
    walnut = PlantSpecies.create!(latin_name: "Juglans regia", plant_type: "tree", height_max_m: 25)
    walnut.replace_common_names!([ "Noyer commun" ])
    walnut.record_provenance!(%w[height_max_m], source: "pfaf", status: "sourced")

    data, error = call_tool(@owner, "search_plants", { query: "noyer" })
    refute error
    assert_equal "Juglans regia", data["results"].sole["latinName"]

    data, error = call_tool(@owner, "get_plant", { plant_id: walnut.id })
    refute error
    assert_equal "Juglans regia", data["latinName"]
    assert_equal "pfaf", data.dig("provenance", "heightMaxM", "source")

    _text, error = call_tool(@owner, "get_plant", { plant_id: walnut.id + 1000 })
    assert error
  end

  test "propose_features creates drafts with their rationale, and reports invalid ones" do
    make_editor(@map, users(:bob))
    features = [
      { layer: "plants", kind: "fruit_tree", name: "Pommier", rationale: "Plein sud, sol profond, objectif fruitier.", geometry: point(lng: 4.906, lat: 50.341), properties: { species: "Malus domestica" } },
      { layer: "water", kind: "swale", rationale: "Suivre la courbe de niveau pour infiltrer.", geometry: { type: "LineString", coordinates: [ [ 4.905, 50.3415 ], [ 4.908, 50.3416 ] ] } },
      { layer: "structures", kind: "shed", rationale: "Trop loin du terrain, refusé.", geometry: point(lng: 4.95, lat: 50.36) },
      { layer: "plants", kind: "hedge", rationale: "Polygone croisé : invalide.", geometry: { type: "Polygon", coordinates: [ [ [ 4.905, 50.340 ], [ 4.906, 50.341 ], [ 4.906, 50.340 ], [ 4.905, 50.341 ], [ 4.905, 50.340 ] ] ] } }
    ]
    data, error = call_tool(@stranger, "propose_features", { map_id: @map.id, summary: "Verger et baissière", features: })
    refute error, data
    assert_equal [ 0, 1 ], data["created"].map { |c| c["index"] }
    assert_equal [ 2, 3 ], data["rejected"].map { |r| r["index"] }
    assert_match(/hors du terrain/, data["rejected"][0]["error"])
    assert_match(/invalide/, data["rejected"][1]["error"])
    assert_equal 2, data["pending_drafts"]

    tree = MapFeature.find(data["created"][0]["id"])
    assert_equal [ "draft", "ai", "Plein sud, sol profond, objectif fruitier." ], [ tree.status, tree.source, tree.rationale ]
    assert_equal "Malus domestica", tree.properties["species"]
    assert_equal users(:bob), tree.created_by

    action = AiAction.last
    assert_equal [ "propose_features", "ok", @map ], [ action.tool, action.status, action.map ]
    assert_equal "Verger et baissière", action.arguments["summary"]
    assert_equal({ "plants" => 2, "water" => 1, "structures" => 1 }, action.arguments["layers"])
    assert_equal data["created"].map { |c| c["id"] }, action.result["feature_ids"]
    assert_nil action.arguments["features"].try(:first), "geometries are not copied in the journal"
  end

  test "propose_features links each draft to the photos it was read from, and a rejected draft lets them go" do
    make_editor(@map, users(:bob))
    gate = create_photo(salt: "portail", location: MapPhoto.point_from(4.906, 50.341))
    burrow = create_photo(salt: "terrier", location: MapPhoto.point_from(4.9062, 50.3411))
    other_map = create_photo(map: Map.create!(name: "Ailleurs", owner: users(:bob), region: regions(:wallonia)), salt: "ailleurs")
    features = [
      { layer: "access", kind: "gate", rationale: "Portail en bois vu sur la photo, à l'entrée nord.", geometry: point(lng: 4.906, lat: 50.341), photo_ids: [ gate.id ] },
      { layer: "notes", kind: "note", name: "Terrier", rationale: "Entrée de terrier de blaireau sur la photo.", geometry: point(lng: 4.9062, lat: 50.3411), photo_ids: [ burrow.id ] },
      { layer: "access", kind: "gate", rationale: "Le même portail, proposé deux fois.", geometry: point(lng: 4.906, lat: 50.341), photo_ids: [ gate.id ] },
      { layer: "notes", kind: "note", rationale: "Une photo d'une autre carte.", geometry: point(lng: 4.906, lat: 50.341), photo_ids: [ other_map.id ] }
    ]
    data, error = call_tool(@stranger, "propose_features", { map_id: @map.id, features: })
    refute error, data
    assert_equal [ 0, 1 ], data["created"].map { |c| c["index"] }
    assert_match(/déjà reliée/, data["rejected"][0]["error"])
    assert_match(/introuvable/, data["rejected"][1]["error"])

    gate_draft, burrow_draft = data["created"].map { |c| MapFeature.find(c["id"]) }
    assert_equal gate_draft.id, gate.reload.map_feature_id
    assert_equal burrow_draft.id, burrow.reload.map_feature_id
    assert_nil other_map.reload.map_feature_id

    gate_draft.update!(status: "active")
    burrow_draft.update!(status: "rejected")
    assert_equal gate_draft.id, gate.reload.map_feature_id, "an accepted element keeps its photo"
    assert_nil burrow.reload.map_feature_id, "a rejected draft gives its photo back to the library"
  end

  test "propose_features reports an element the library refuses instead of failing" do
    make_editor(@map, users(:bob))
    line = { type: "LineString", coordinates: [ [ 4.905, 50.3405 ], [ 4.907, 50.3406 ] ] }
    features = [
      { layer: "plants", kind: "hedge", rationale: "Haie brise-vent au nord du verger.", geometry: line },
      { layer: "structures", kind: "hedge", rationale: "Haie au polygone : se dessine en ligne.", geometry: { type: "Polygon", coordinates: [ [ [ 4.905, 50.340 ], [ 4.906, 50.340 ], [ 4.906, 50.341 ], [ 4.905, 50.341 ], [ 4.905, 50.340 ] ] ] } },
      { layer: "structures", kind: "hedge", rationale: "Haie champêtre en deux rangs.", geometry: line, properties: { rows: "deux" } },
      { layer: "structures", kind: "hedge", rationale: "Haie champêtre en deux rangs.", geometry: line, properties: { rows: 2 } }
    ]
    data, error = call_tool(@stranger, "propose_features", { map_id: @map.id, features: })
    refute error, data
    assert_equal [ 3 ], data["created"].map { |c| c["index"] }
    assert_equal [ 0, 1, 2 ], data["rejected"].map { |r| r["index"] }
    assert_match(/couche « Structures »/i, data["rejected"][0]["error"])
    assert_match(/ligne/, data["rejected"][1]["error"])
    assert_equal "structures", MapFeature.find(data["created"].sole["id"]).layer

    data, error = call_tool(@stranger, "propose_features", { map_id: @map.id, features: features.first(1) })
    assert error
    assert_match(/Structures/i, data)
    assert_equal "error", AiAction.last.status
    refute_equal "internal_error", AiAction.last.error_message
  end

  test "propose_features drafts a season sign the person told, kept out of the year until accepted" do
    make_editor(@map, users(:bob))
    sign = { layer: "notes", kind: "season_sign", name: "Premier gel", rationale: "Michael l'a vu hier matin au bas de la prairie.",
             properties: { sign: "first_frost", observed_at: "2026-10-18T07:00:00Z" }, geometry: point(lng: 4.905, lat: 50.3405) }
    data, error = call_tool(@stranger, "propose_features", { map_id: @map.id, features: [ sign ] })
    refute error, data
    feature = MapFeature.find(data["created"].sole["id"])
    assert_equal [ "draft", "first_frost", Time.utc(2026, 10, 18, 7) ], [ feature.status, feature.properties["sign"], feature.observed_at ]
    assert_empty @map.features.active.where(kind: "season_sign")
  end

  test "propose_features keeps the day a season sign was seen, even given as a day alone" do
    make_editor(@map, users(:bob))
    signs = [ "2025-01-12", "12/01/2025" ].map do |day|
      { layer: "notes", kind: "season_sign", name: "La neige fond d'abord ici", rationale: "Noté le 12 janvier 2025.",
        properties: { sign: "snow_melts_first", observed_at: day }, geometry: point(lng: 4.905, lat: 50.3405) }
    end
    data, error = call_tool(@stranger, "propose_features", { map_id: @map.id, features: signs })
    refute error, data
    days = data["created"].map { MapFeature.find(_1["id"]).observed_at }
    assert_equal [ Time.utc(2025, 1, 12, 8) ] * 2, days
  end

  test "propose_features drafts a named zone in its colour" do
    make_editor(@map, users(:bob))
    zone = { layer: "notes", kind: "zone", name: "Forêt-jardin en strates hautes", color: "#7FA650", rationale: "Plein sud, à l'abri de la haie.",
             geometry: { type: "Polygon", coordinates: [ [ [ 4.905, 50.340 ], [ 4.906, 50.340 ], [ 4.906, 50.341 ], [ 4.905, 50.341 ], [ 4.905, 50.340 ] ] ] } }
    data, error = call_tool(@stranger, "propose_features", { map_id: @map.id, features: [ zone ] })
    refute error, data
    feature = MapFeature.find(data["created"].sole["id"])
    assert_equal [ "zone", "Forêt-jardin en strates hautes", { "color" => "#7fa650" } ], [ feature.kind, feature.name, feature.style ]

    _text, error = call_tool(@stranger, "propose_features", { map_id: @map.id, features: [ zone.merge(color: "vert") ] })
    assert error, "a colour is a hexadecimal code"
  end

  test "tags: listed by get_map, filtered by list_features, proposed with drafts" do
    make_editor(@map, users(:bob))
    @pipe.update!(tags: [ "Phase 1" ])
    shed = @map.features.create!(layer: "notes", kind: "note", geometry: point(lng: 4.906, lat: 50.341), tags: [ "phase 1", "Abri" ])

    data, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_equal({ "Abri" => 1, "phase 1" => 1 }, data["tags"], "networks are hidden from viewers, their tags too")
    data, = call_tool(@owner, "get_map", { map_id: @map.id })
    assert_equal 2, data["tags"].values_at("Phase 1", "phase 1").compact.sole

    data, = call_tool(@viewer, "list_features", { map_id: @map.id, tag: "PHASE 1" })
    assert_equal [ shed.id ], data["features"].map { |f| f["id"] }
    assert_equal [ "phase 1", "Abri" ], data["features"].sole.dig("properties", "tags")

    feature = { layer: "plants", kind: "fruit_tree", rationale: "Plein sud, sol profond.", geometry: point(lng: 4.906, lat: 50.341) }
    data, error = call_tool(@stranger, "propose_features", { map_id: @map.id, features: [ feature.merge(tags: [ "Phase 1 ", "  " ]) ] })
    refute error, data
    assert_equal [ "Phase 1" ], MapFeature.find(data["created"].sole["id"]).tags
    _text, error = call_tool(@stranger, "propose_features", { map_id: @map.id, features: [ feature.merge(tags: [ "x" * 41 ]) ] })
    assert error, "tags longer than 40 characters are refused"
  end

  test "propose_features needs the drafts scope, an editor role and the owner's plan" do
    feature = { layer: "plants", kind: "tree", rationale: "Une bonne raison d'être là.", geometry: point(lng: 4.906, lat: 50.341) }

    text, error = call_tool(@viewer, "propose_features", { map_id: @map.id, features: [ feature ] })
    assert error
    assert_match(/propriétaire et les éditeurs/, text)

    read_only = personal_token(users(:michael), access: "read")
    text, error = call_tool(read_only, "propose_features", { map_id: @map.id, features: [ feature ] })
    assert error
    assert_match(/lecture/, text)

    with_billing do
      text, error = call_tool(@owner, "propose_features", { map_id: @map.id, features: [ feature ] })
      assert error
      assert_match(/forfait/, text)
    end

    _, error = call_tool(@owner, "propose_features", { map_id: @map.id, features: [ feature.merge(layer: "networks") ] })
    assert error, "networks cannot be proposed"
    _, error = call_tool(@owner, "propose_features", { map_id: @map.id, features: [ feature.except(:rationale) ] })
    assert error, "rationale is required"
    assert_equal 0, @map.features.drafts.count

    @map.update!(boundary: nil)
    text, error = call_tool(@owner, "propose_features", { map_id: @map.id, features: [ feature ] })
    assert error
    assert_match(/contour/, text)
  end

  test "a free owner on trial gets drafts, and Claude is told until when" do
    with_billing do
      trial = personal_token(users(:michael))   # first connection with drafts: the trial starts
      data, error = call_tool(trial, "get_map", { map_id: @map.id })
      refute error
      assert data.dig("permissions", "propose_drafts")
      assert data.dig("permissions", "drafts_trial_ends_at")
      assert_match(/essaie les brouillons/, data.dig("permissions", "drafts_trial_note"))

      travel 15.days do
        data, = call_tool(trial, "get_map", { map_id: @map.id })
        refute data.dig("permissions", "propose_drafts")
        assert_nil data.dig("permissions", "drafts_trial_ends_at")
      end
    end
  end

  test "propose_features caps the batch size" do
    feature = { layer: "plants", kind: "tree", rationale: "Une bonne raison d'être là.", geometry: point(lng: 4.906, lat: 50.341) }
    text, error = call_tool(@owner, "propose_features", { map_id: @map.id, features: [ feature ] * 201 })
    assert error
    assert_match(/Invalid arguments/, text)
  end

  test "propose_palette brings a list of plants into the palette as drafts" do
    @map.palette_items.create!(species: plant_species(:alder))
    plants = [
      { name: "Pommier", target_count: 6, rationale: "Ligne 2 du tableur de l'utilisateur." },
      { species_id: plant_species(:comfrey).id, role: "support", rationale: "Ligne 3 du tableur de l'utilisateur." },
      { name: plant_species(:alder).latin_name, rationale: "Ligne 4 du tableur de l'utilisateur." },
      { name: "Plante imaginaire", rationale: "Ligne 5 du tableur de l'utilisateur." },
      { name: "Pommier", rationale: "Ligne 6, en double dans le tableur." }
    ]
    data, error = call_tool(@owner, "propose_palette", { map_id: @map.id, summary: "Mon tableur de plantes", plants: })
    refute error, data
    assert_equal [ 0, 1 ], data["created"].map { |c| c["index"] }
    assert_equal [ 2, 3, 4 ], data["rejected"].map { |r| r["index"] }
    assert_match(/déjà dans la palette/, data["rejected"][0]["error"])
    assert_match(/search_plants/, data["rejected"][1]["error"])
    assert_equal 2, data["pending_palette_drafts"]

    apple = PaletteItem.find(data["created"][0]["id"])
    assert_equal [ "draft", "ai", 6, plant_species(:apple) ], [ apple.status, apple.source, apple.target_count, apple.species ]
    assert_equal [ plant_species(:alder) ], @map.palette_items.map(&:species), "drafts stay out of the palette"
    assert_equal({ "created" => 2, "rejected" => 3 }, AiAction.last.result)

    data, = call_tool(@owner, "get_map", { map_id: @map.id })
    assert_equal [ plant_species(:alder).id ], data["palette"].map { |p| p["species_id"] }
    assert_equal 2, data["palette_drafts_pending"]

    text, error = call_tool(@viewer, "propose_palette", { map_id: @map.id, plants: plants.first(1) })
    assert error
    assert_match(/propriétaire et les éditeurs/, text)
    _, error = call_tool(@owner, "propose_palette", { map_id: @map.id, plants: [ { name: "Pommier" } ] })
    assert error, "rationale is required"
  end

  test "propose_palette names a cultivar: the catalogue's, or a new one created when a human accepts it" do
    plants = [
      { species_id: plant_species(:apple).id, variety_name: "belle-de-boskoop", rationale: "Ligne 2 du tableur." },
      { species_id: plant_species(:apple).id, variety_name: "'Belle fleur double'", rationale: "Ligne 3 du tableur." },
      { species_id: plant_species(:apple).id, variety_name: "Belle fleur double", rationale: "Ligne 4, en double." }
    ]
    assert_no_difference "PlantVariety.count" do
      data, error = call_tool(@owner, "propose_palette", { map_id: @map.id, plants: })
      refute error, data
      assert_equal [ 0, 1 ], data["created"].map { |c| c["index"] }
      assert_equal plant_varieties(:boskoop).id, data["created"][0]["variety_id"]
      assert data["created"][1]["new_variety"]
      assert_equal [ 2 ], data["rejected"].map { |r| r["index"] }
    end

    draft = PaletteItem.find_by!(map: @map, variety_name: "Belle fleur double")
    assert_nil draft.variety
    assert draft.as_json[:newVariety]
    assert_equal "Malus domestica 'Belle fleur double'", draft.latin_name

    assert_difference "PlantVariety.count", 1 do
      draft.activate!
    end
    draft.reload
    assert_equal [ "active", nil, "Belle fleur double" ], [ draft.status, draft.variety_name, draft.variety.name ]
  end

  test "get_project_sheet gives every question, its allowed answers in French and the current answers" do
    @map.update!(project: { "budget" => { "initial" => "under_500" } })
    data, error = call_tool(@viewer, "get_project_sheet", { map_id: @map.id })
    refute error, data
    assert_equal ProjectSheet::SECTIONS.keys, data["sections"].map { |s| s["key"] }
    budget = data["sections"].find { |s| s["key"] == "budget" }
    initial = budget["fields"].find { |f| f["key"] == "initial" }
    assert_equal [ "enum", "under_500" ], initial.values_at("type", "value")
    assert_equal I18n.t("journey.project.sections.budget.fields.initial.options.under_500"), initial.dig("options", "under_500")
    people = data["sections"].first["fields"].find { |f| f["key"] == "people" }
    assert_equal %w[name role note], people["item"].map { |i| i["key"] }
    assert_equal 33, budget["percent"]
    assert_empty data["pending_drafts"]
    assert_equal({ "percent" => 3 }, AiAction.last.result)
  end

  test "propose_project_sheet turns what the person said into answers waiting on the sheet" do
    @map.update!(project: { "budget" => { "initial" => "under_500" }, "time" => { "hours_per_week" => 4 } })
    answers = [
      { section: "ambitions", field: "goals", value: %w[food_autonomy biodiversity], rationale: "« On veut manger nos fruits et accueillir la vie »." },
      { section: "budget", field: "initial", value: "up_to_2000", rationale: "« On peut mettre jusqu'à 2 000 € au départ »." },
      { section: "time", field: "hours_per_week", value: 4, rationale: "« Quatre heures par semaine, le samedi »." },
      { section: "who", field: "people", value: [ { name: "Marie", role: "lead" } ], rationale: "Marie se présente comme la porteuse du projet." },
      { section: "budget", field: "initial", value: "under_500", rationale: "Doublon dans le même appel, à refuser." },
      { section: "uses", field: "presence", value: "every_minute", rationale: "Valeur hors de la liste des réponses." },
      { section: "uses", field: "size", value: "big", rationale: "Champ inconnu de la fiche projet." }
    ]
    data, error = call_tool(@owner, "propose_project_sheet", { map_id: @map.id, summary: "Entretien du 3 octobre", answers: })
    refute error, data
    assert_equal [ 0, 1, 3 ], data["created"].map { |c| c["index"] }
    assert_equal "under_500", data["created"][1]["replaces"], "an answer already given is flagged, never replaced silently"
    assert_equal [ 2 ], data["unchanged"].map { |u| u["index"] }
    assert_equal [ 4, 5, 6 ], data["rejected"].map { |r| r["index"] }
    assert_match(/déjà proposé/, data["rejected"][0]["error"])
    assert_match(/daily/, data["rejected"][1]["error"])
    assert_match(/champ inconnu/, data["rejected"][2]["error"])
    assert_match(/dis-le à la personne/, data["next_step"])
    assert_equal 3, data["pending_project_drafts"]
    assert_equal "under_500", @map.reload.project.dig("budget", "initial"), "the sheet waits for a human"
    assert_equal({ "created" => 3, "unchanged" => 1, "rejected" => 3 }, AiAction.last.result)

    # A new proposal for the same field replaces the pending one.
    call_tool(@owner, "propose_project_sheet", { map_id: @map.id, answers: [ { section: "budget", field: "initial", value: "up_to_5000", rationale: "« Finalement plutôt 5 000 € »." } ] })
    assert_equal [ "up_to_5000" ], @map.project_sheet_drafts.where(section: "budget").pluck(:value)

    data, = call_tool(@owner, "get_map", { map_id: @map.id })
    assert_equal 3, data["project_drafts_pending"]

    text, error = call_tool(@viewer, "propose_project_sheet", { map_id: @map.id, answers: answers.first(1) })
    assert error
    assert_match(/propriétaire et les éditeurs/, text)
    text, error = call_tool(@owner, "propose_project_sheet", { map_id: @map.id, answers: answers.last(2) })
    assert error
    assert_match(/Aucun brouillon/, text)
  end

  test "propose_project_sheet follows the owner's plan, like every AI draft" do
    with_billing do
      text, error = call_tool(@owner, "propose_project_sheet", { map_id: @map.id, answers: [
        { section: "budget", field: "initial", value: "up_to_2000", rationale: "« Jusqu'à 2 000 € au départ »." }
      ] })
      assert error
      assert_match(/forfait/, text)
    end
  end

  test "withdraw_draft removes AI drafts only" do
    draft = @map.features.create!(layer: "plants", kind: "tree", status: "draft", source: "ai", rationale: "x" * 12, geometry: point)
    accepted = @map.features.create!(layer: "plants", kind: "tree", status: "active", source: "ai", rationale: "x" * 12, geometry: point)
    data, error = call_tool(@owner, "withdraw_draft", { map_id: @map.id, feature_ids: [ draft.id, accepted.id ] })
    refute error
    assert_equal [ draft.id ], data["withdrawn"]
    assert_equal [ accepted.id ], data["not_found"]
    refute MapFeature.exists?(draft.id)

    _, error = call_tool(@viewer, "withdraw_draft", { map_id: @map.id, feature_ids: [ accepted.id ] })
    assert error
  end

  test "search_plants with a map: how each plant fits the terrain, and suggestions without a query" do
    regions(:wallonia).update!(settings: { "climate" => { "hardiness_zone" => 7 } })
    @map.features.create!(layer: "plants", kind: "patch", geometry: square(lng: 4.904, lat: 50.3395, size: 0.0002),
                          properties: { "exposure" => "shade" })

    data, error = call_tool(@owner, "search_plants", { query: "Malus", map_id: @map.id })
    refute error
    apple = data["results"].sole
    assert_equal "one_misfit", apple.dig("fit", "tier")
    assert_equal({ "key" => "exposure", "status" => "misfit", "site" => [ "shade" ], "verified" => false },
                 apple.dig("fit", "criteria").find { |c| c["key"] == "exposure" })
    assert_nil apple["excludedBy"]
    assert_equal "patches", data.dig("site", "signals", "exposure", "origin")

    data, = call_tool(@owner, "search_plants", { query: "Robinia", map_id: @map.id })
    assert_equal "invasive", data["results"].sole["excludedBy"]

    data, error = call_tool(@owner, "search_plants", { map_id: @map.id })
    refute error
    assert data["suggestions"].any?
    assert data["suggestions"].all? { |s| s["fit"] && s["reason"] }
    assert_equal 1, data.dig("excluded", "invasive")

    text, error = call_tool(@owner, "search_plants", {})
    assert error
    assert_match(/map_id/, text)
  end

  test "plant tools never show another person's species awaiting review" do
    species = PlantSpecies.create!(latin_name: "Salvia nemorosa", review_status: "proposed", proposed_by: users(:bob))
    data, = call_tool(@owner, "search_plants", { query: "nemorosa" })
    assert_empty data["results"]
    _text, error = call_tool(@owner, "get_plant", { plant_id: species.id })
    assert error
  end
end
