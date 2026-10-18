require "test_helper"

class Maps::PlantPalettesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @apple = plant_species(:apple)
    @map.features.create!(layer: "plants", kind: "plant", geometry: point, tags: [ "Chantier mars" ], properties: { "species_id" => @apple.id })
  end

  test "everyone on the map sees the palette page with its views" do
    PlantPaletteView.create!(map: @map, name: "Chantier mars", settings: { filters: { tag: "Chantier mars" } })
    sign_in_as users(:alice)
    get map_plant_palette_path(@map), headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal "maps/plant_palettes/show", response.parsed_body["component"]
    assert_equal [ "Chantier mars" ], props["views"].map { _1["name"] }
    assert_equal 4, props["presets"].size
    assert_equal false, props["canEdit"]
    assert_equal 1, props["rows"].find { _1["speciesId"] == @apple.id }["planned"]
  end

  test "strangers see nothing" do
    sign_in_as users(:bob)
    get map_plant_palette_path(@map), as: :json
    assert_response :not_found
  end

  test "the plant's life on the land" do
    sign_in_as users(:alice)
    get plant_map_plant_palette_path(@map, key: "#{@apple.id}-"), as: :json
    assert_response :success
    assert_equal 1, response.parsed_body["plants"].size
    get plant_map_plant_palette_path(@map, key: "abc"), as: :json
    assert_response :not_found
  end

  test "an editor prices a plant drawn but not yet in the palette, which adds it" do
    sign_in_as users(:michael)
    patch plant_map_plant_palette_path(@map, key: "#{@apple.id}-"), params: { plant: { unit_price: "12.5", supplier: "Pépinière du Bocq", size: "C3" } }, as: :json
    assert_response :success
    item = @map.palette_items.find_by!(species: @apple)
    assert_equal 12.5, item.unit_price.to_f
    assert_equal "C3", item.size
    row = response.parsed_body["rows"].find { _1["speciesId"] == @apple.id }
    assert row["inPalette"]
    assert_equal "Pépinière du Bocq", row["supplier"]

    patch plant_map_plant_palette_path(@map, key: "#{@apple.id}-"), params: { plant: { unit_price: "-3" } }, as: :json
    assert_response :unprocessable_entity
    patch plant_map_plant_palette_path(@map, key: "existing:Vieux chêne"), params: { plant: { unit_price: "3" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "a viewer cannot price a plant" do
    sign_in_as users(:alice)
    patch plant_map_plant_palette_path(@map, key: "#{@apple.id}-"), params: { plant: { unit_price: "3" } }, as: :json
    assert_response :forbidden
  end

  test "editors save, rename and delete views; viewers cannot" do
    sign_in_as users(:michael)
    post map_plant_palette_views_path(@map), params: { view: { name: "Budget (copie)", settings: { columns: %w[name unit_price], group_by: "supplier" } } }, as: :json
    assert_response :created
    id = response.parsed_body["view"]["id"]
    assert_equal "supplier", response.parsed_body["view"]["settings"]["group_by"]

    patch map_plant_palette_view_path(@map, id), params: { view: { name: "Courses de mars", settings: {
      columns: %w[name to_plant], sort: { key: "to_plant", dir: "desc" },
      filters: { to_plant_only: true, statuses: %w[planned planting], tag: "Chantier mars" }, unknown: "dropped"
    } } }, as: :json
    assert_response :success
    view = PlantPaletteView.find(id)
    assert_equal "Courses de mars", view.name
    assert view.settings["filters"]["to_plant_only"]
    assert_equal %w[planned planting], view.settings["filters"]["statuses"]
    assert_equal "Chantier mars", view.settings["filters"]["tag"]
    assert_equal({ "key" => "to_plant", "dir" => "desc" }, view.settings["sort"])
    assert_not view.settings.key?("unknown")

    delete map_plant_palette_view_path(@map, id), as: :json
    assert_response :success
    assert_empty response.parsed_body["views"]

    sign_in_as users(:alice)
    post map_plant_palette_views_path(@map), params: { view: { name: "Ma vue" } }, as: :json
    assert_response :forbidden
  end

  test "an editor sets the role and strata of several species at once, and undoes it" do
    alder = plant_species(:alder)
    @map.palette_items.create!(species: alder, role: "pioneer", unit_price: 4.5)
    sign_in_as users(:michael)
    keys = [ "#{@apple.id}-", "#{alder.id}-" ]

    post batch_map_plant_palette_path(@map), params: { batch: { keys:, change: "role", value: "food" } }, as: :json
    assert_response :success
    assert_equal 2, response.parsed_body["changed"]["species"]
    assert_equal %w[food food], @map.palette_items.where(species: [ @apple, alder ]).pluck(:role)
    assert_equal "food", response.parsed_body["rows"].find { _1["speciesId"] == @apple.id }["role"]

    post undo_batch_map_plant_palette_path(@map), params: { undo: response.parsed_body["undo"] }, as: :json
    assert_response :success
    assert_nil @map.palette_items.find_by(species: @apple), "the apple was not in the palette before"
    item = @map.palette_items.find_by!(species: alder)
    assert_equal "pioneer", item.role
    assert_equal 4.5, item.unit_price.to_f

    post batch_map_plant_palette_path(@map), params: { batch: { keys:, change: "strata", value: "shrub" } }, as: :json
    assert_equal %w[shrub shrub], @map.palette_items.where(species: [ @apple, alder ]).pluck(:strata)
    post batch_map_plant_palette_path(@map), params: { batch: { keys:, change: "strata", value: "" } }, as: :json
    assert_equal [ nil, nil ], @map.palette_items.where(species: [ @apple, alder ]).pluck(:strata)

    post batch_map_plant_palette_path(@map), params: { batch: { keys:, change: "strata", value: "sky" } }, as: :json
    assert_response :unprocessable_entity
    post batch_map_plant_palette_path(@map), params: { batch: { keys: [ "existing:Vieux chêne" ], change: "role", value: "food" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "plants go in the ground together, keeping the dates already known" do
    planted = @map.features.create!(layer: "plants", kind: "plant", geometry: point, properties: { "species_id" => @apple.id, "planted_on" => "2020-03-01" })
    sign_in_as users(:michael)

    post batch_map_plant_palette_path(@map), params: { batch: { keys: [ "#{@apple.id}-" ], change: "planted", value: "today" } }, as: :json
    assert_response :success
    assert_equal 1, response.parsed_body["changed"]["plants"]
    dates = @map.features.where(kind: "plant").order(:id).map { _1.properties["planted_on"] }
    assert_equal [ Date.current.iso8601, "2020-03-01" ], dates

    post undo_batch_map_plant_palette_path(@map), params: { undo: response.parsed_body["undo"] }, as: :json
    assert_nil @map.features.where(kind: "plant").order(:id).first.properties["planted_on"]

    post batch_map_plant_palette_path(@map), params: { batch: { plant_ids: [ planted.id ], change: "planted", value: "planned" } }, as: :json
    assert_nil planted.reload.properties["planted_on"]
    post batch_map_plant_palette_path(@map), params: { batch: { plant_ids: [ planted.id ], change: "planted", value: "unknown" } }, as: :json
    assert_equal "unknown", planted.reload.properties["planted_on_precision"]
  end

  test "deleting species takes them out of the palette and trashes their plants, until undone" do
    item = @map.palette_items.create!(species: @apple, role: "food", supplier: "Pépinière du Bocq")
    plant = @map.features.find_by!(kind: "plant")
    other = @map.features.create!(layer: "plants", kind: "plant", geometry: point, properties: { "species_id" => plant_species(:alder).id })
    sign_in_as users(:michael)

    post batch_map_plant_palette_path(@map), params: { batch: { keys: [ "#{@apple.id}-" ], change: "delete" } }, as: :json
    assert_response :success
    assert_equal 1, response.parsed_body["changed"]["species"]
    assert_equal 1, response.parsed_body["changed"]["plants"]
    assert_not PaletteItem.exists?(item.id)
    assert plant.reload.trashed?
    assert_not other.reload.trashed?
    assert_nil response.parsed_body["rows"].find { _1["speciesId"] == @apple.id }

    post undo_batch_map_plant_palette_path(@map), params: { undo: response.parsed_body["undo"] }, as: :json
    assert_response :success
    assert_not plant.reload.trashed?
    restored = @map.palette_items.find_by!(species: @apple)
    assert_equal [ "food", "Pépinière du Bocq" ], [ restored.role, restored.supplier ]

    post batch_map_plant_palette_path(@map), params: { batch: { plant_ids: [ other.id ], change: "delete" } }, as: :json
    assert other.reload.trashed?
  end

  test "a viewer cannot act on a selection" do
    sign_in_as users(:alice)
    post batch_map_plant_palette_path(@map), params: { batch: { keys: [ "#{@apple.id}-" ], change: "delete" } }, as: :json
    assert_response :forbidden
    assert_not @map.features.find_by!(kind: "plant").trashed?
  end
end
