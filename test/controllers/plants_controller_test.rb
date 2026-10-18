require "test_helper"

class PlantsControllerTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:bob) }

  test "requires sign in" do
    sign_out
    get plants_path
    assert_redirected_to new_session_path
  end

  test "index renders the catalogue page" do
    get plants_path, headers: inertia_headers
    assert_response :success
    page = response.parsed_body
    assert_equal "plants/index", page["component"]
    assert_equal PlantSpecies.count, page["props"]["search"]["total"]
    assert_includes page["props"]["vocabulary"]["strata"], "ground_cover"
  end

  test "the card and the sheet show the species' photo with its credit" do
    apple = plant_species(:apple)
    photo = apple.photos.new(file_title: "Malus.jpg", author: "Jean Dupont", license: "CC BY-SA 4.0",
                             page_url: "https://commons.wikimedia.org/wiki/File:Malus.jpg")
    photo.image.attach(io: file_fixture("plant.png").open, filename: "malus.png")
    photo.save!

    get plants_path(q: "Malus"), as: :json
    card = response.parsed_body["results"].sole["photo"]
    assert_equal [ "Jean Dupont", "CC BY-SA 4.0" ], card.values_at("author", "license")
    assert_match %r{/rails/active_storage/representations/}, card["cardUrl"]

    get plant_path(apple), headers: inertia_headers
    assert_equal "https://commons.wikimedia.org/wiki/File:Malus.jpg", response.parsed_body.dig("props", "species", "photo", "pageUrl")

    get plants_path(q: "Alnus"), as: :json
    assert_nil response.parsed_body["results"].sole["photo"]
  end

  test "index searches without accents and filters as JSON" do
    get plants_path(q: "fraisiér"), as: :json
    assert_equal [ "Fragaria vesca" ], response.parsed_body["results"].map { |r| r["latinName"] }

    get plants_path(nitrogen: "1", no_invasive: "1"), as: :json
    assert_equal [ "Alnus glutinosa" ], response.parsed_body["results"].map { |r| r["latinName"] }

    get plants_path(strata: [ "ground_cover", "herbaceous" ]), as: :json
    assert_equal %w[Fragaria Symphytum], response.parsed_body["results"].map { |r| r["latinName"].split.first }.sort

    get plants_path(zone: "5", exposures: [ "sun" ], edible: "1"), as: :json
    assert_equal [ "Malus domestica" ], response.parsed_body["results"].map { |r| r["latinName"] }

    get plants_path(native: "1", country: "BE"), as: :json
    assert_equal 3, response.parsed_body["total"]

    get plants_path(q: "pommier reinette-grise"), as: :json
    apple = response.parsed_body["results"].sole
    assert_equal [ "Reinette grise" ], apple["namedVarieties"].map { |v| v["name"] }, "the cultivars the query names come along"
  end

  test "show renders a sheet with provenance and observation stats" do
    get plant_path(plant_species(:apple)), headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal "plants/show", response.parsed_body["component"]
    sheet = props["species"]
    assert_equal "Malus domestica", sheet["latinName"]
    assert_equal "trefle", sheet["provenance"]["heightMaxM"]["source"]
    assert_equal "usda", sheet["provenance"]["heightMaxM"]["upstreamSource"]
    assert_equal "domaine public US", sheet["provenance"]["heightMaxM"]["license"]
    assert_equal "PFAF, usage non commercial", sheet["provenance"]["hardinessZone"]["license"]
    assert_equal 2, sheet["varieties"].size
    assert_nil props["observations"]
    assert_equal({ "points" => [], "maps" => [], "inGround" => 0, "planned" => 0, "truncated" => false }, props["plantings"])
  end

  test "the catalogue counts plants in the ground; a sheet maps only the viewer's maps" do
    map = maps(:ahinvaux)
    map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.906, lat: 50.341),
                         properties: { "species_id" => plant_species(:apple).id, "planted_on" => "2026-03-01" })

    get plants_path(q: "Malus"), as: :json
    assert_equal 1, response.parsed_body["results"].first["inGround"]

    get plant_path(plant_species(:apple)), headers: inertia_headers
    assert_empty response.parsed_body["props"]["plantings"]["points"], "bob has no access to the map"
    assert_equal 1, response.parsed_body["props"]["observations"]["plants"], "anonymous counts stay global"

    sign_in_as users(:alice)
    get plant_path(plant_species(:apple)), headers: inertia_headers
    plantings = response.parsed_body["props"]["plantings"]
    assert_equal 1, plantings["inGround"]
    assert_equal [ map.id ], plantings["maps"].map { |m| m["id"] }
  end

  test "show as JSON" do
    get plant_path(plant_species(:alder)), as: :json
    assert_equal "Alnus glutinosa", response.parsed_body["species"]["latinName"]
  end

  test "a proposed species shows only to its author, the maps that use it and reviewers" do
    map = maps(:ahinvaux)
    species = PlantSpecies.create!(latin_name: "Salvia nemorosa", review_status: "proposed", proposed_by: users(:michael), proposed_map: map)
    map.palette_items.create!(species:)

    get plants_path(q: "nemorosa"), as: :json
    assert_empty response.parsed_body["results"], "bob opens no map that uses it"
    get plant_path(species), headers: inertia_headers
    assert_response :not_found
    get plants_path, headers: inertia_headers
    assert_nil response.parsed_body.dig("props", "toReview")
    assert_equal PlantSpecies.reviewed.count, response.parsed_body.dig("props", "catalogueSize")

    sign_in_as users(:alice)
    get plants_path(q: "nemorosa"), as: :json
    assert_equal [ "proposed" ], response.parsed_body["results"].map { _1["reviewStatus"] }
    get plant_path(species), headers: inertia_headers
    assert_response :success

    users(:bob).update!(catalogue_reviewer: true)
    sign_in_as users(:bob)
    get plants_path, headers: inertia_headers
    assert_equal 1, response.parsed_body.dig("props", "toReview")
  end
end
