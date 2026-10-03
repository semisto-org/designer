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
  end

  test "show as JSON" do
    get plant_path(plant_species(:alder)), as: :json
    assert_equal "Alnus glutinosa", response.parsed_body["species"]["latinName"]
  end
end
