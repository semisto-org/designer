require "test_helper"

# « Planter » on the phone: a plant read from its nursery label joins the
# palette with its cultivar.
class Maps::FieldPlantingTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @apple = plant_species(:apple)
    sign_in_as users(:michael)
  end

  def plant(properties, palette: nil)
    post map_features_path(@map), params: { feature: { layer: "plants", kind: "plant", geometry: point, properties: }, palette: }.compact, as: :json
  end

  test "a plant from the land joins an empty palette, with the cultivar named on its label and how it came" do
    assert_difference -> { @map.palette_items.count }, 1 do
      plant({ species_id: @apple.id, nursery_form: "bare_root" }, palette: { variety_name: "'reinette grise'", size: "Racines nues" })
    end
    assert_response :created
    feature = @map.features.find(response.parsed_body["id"])
    assert_equal plant_varieties(:reinette).id, feature.plant_variety_id
    assert_equal "bare_root", feature.properties["nursery_form"]
    item = @map.palette_items.last
    assert_equal [ @apple.id, plant_varieties(:reinette).id, "Racines nues" ], [ item.species_id, item.variety_id, item.size ]
  end

  test "a cultivar the catalogue doesn't know is added by its name" do
    plant({ species_id: @apple.id, planted_on: "2025-01-01", planted_on_precision: "year" }, palette: { variety_name: "Gris de Bruxelles" })
    assert_response :created
    feature = @map.features.find(response.parsed_body["id"])
    assert_equal "Gris de Bruxelles", PlantVariety.find(feature.plant_variety_id).name
    assert_equal "2025-01-01", feature.properties["planted_on"]
    assert @map.palette_items.exists?(variety_id: feature.plant_variety_id)
  end

  test "a second plant of the same line adds nothing to the palette; an AI's draft for it is accepted" do
    draft = @map.palette_items.create!(species: @apple, status: "draft", source: "ai", rationale: "Pommier du verger")
    plant({ species_id: @apple.id }, palette: {})
    assert_equal "active", draft.reload.status
    assert_no_difference -> { PaletteItem.count } do
      assert_difference -> { @map.features.count }, 1 do
        plant({ species_id: @apple.id }, palette: {})
      end
    end
  end

  test "without palette, or without species, the palette is left alone" do
    assert_no_difference -> { PaletteItem.count } do
      plant({ species_id: @apple.id })
      plant({}, palette: { variety_name: "Reinette grise" })
    end
    assert_response :created
  end

  test "a viewer plants nothing" do
    sign_in_as users(:alice)
    assert_no_difference -> { PaletteItem.count } do
      plant({ species_id: @apple.id }, palette: { variety_name: "Nouvelle" })
    end
    assert_response :forbidden
    assert_not PlantVariety.exists?(name: "Nouvelle")
  end
end
