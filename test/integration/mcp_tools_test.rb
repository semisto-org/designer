require "test_helper"
require_relative "../support/map_data_test_helper"
require "test_helpers/mcp_test_helper"

class McpToolsTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper

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
    assert_equal AiAction.last.map, @map

    data, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_nil data.dig("elements", "by_layer", "networks"), "networks are hidden from viewers"
    refute data.dig("permissions", "propose_drafts")

    text, error = call_tool(@stranger, "get_map", { map_id: @map.id })
    assert error
    assert_match(/introuvable/, text)
    assert_nil AiAction.last.map, "no journal entry on a map the user cannot open"
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

  test "get_region_layers lists the region catalogue" do
    regions(:wallonia).layers.create!(key: "sols", name: "Carte des sols", url: "https://geoservices.example/sols", identify_url: "https://geoservices.example/sols/identify")
    data, error = call_tool(@viewer, "get_region_layers", { map_id: @map.id })
    refute error
    assert_equal [ [ "sols", true ] ], data["layers"].map { |l| [ l["key"], l["identifiable"] ] }
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
end
