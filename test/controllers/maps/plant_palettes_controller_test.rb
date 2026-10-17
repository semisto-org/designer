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

    patch map_plant_palette_view_path(@map, id), params: { view: { name: "Courses de mars", settings: { columns: %w[name to_plant], filters: { to_plant_only: true } } } }, as: :json
    assert_response :success
    view = PlantPaletteView.find(id)
    assert_equal "Courses de mars", view.name
    assert view.settings["filters"]["to_plant_only"]

    delete map_plant_palette_view_path(@map, id), as: :json
    assert_response :success
    assert_empty response.parsed_body["views"]

    sign_in_as users(:alice)
    post map_plant_palette_views_path(@map), params: { view: { name: "Ma vue" } }, as: :json
    assert_response :forbidden
  end
end
