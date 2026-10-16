require "test_helper"
require_relative "../../test_helpers/gbif_test_helper"

class Maps::PlantProposalsControllerTest < ActionDispatch::IntegrationTest
  include GbifTestHelper

  setup do
    @map = maps(:ahinvaux)
    stub_gbif({ "Salvia nemorosa" => gbif_accepted("Salvia nemorosa", key: 42),
                "Stipa tenuissima" => gbif_synonym("Stipa tenuissima", "Nassella tenuissima") })
  end

  test "an editor checks a name, then adds the species to the palette" do
    sign_in_as users(:michael)
    get check_map_plant_proposals_path(@map, name: "Stipa tenuissima"), as: :json
    assert_response :success
    assert_equal "synonym", response.parsed_body.dig("gbif", "status")
    assert_equal "Nassella tenuissima", response.parsed_body.dig("gbif", "suggestedName")

    post map_plant_proposals_path(@map), params: { plant_proposal: { latin_name: "Salvia nemorosa", common_name: "Sauge des bois", strata: "herbaceous" } }, as: :json
    assert_response :created
    assert_equal "proposed", response.parsed_body.dig("species", "reviewStatus")
    assert_equal [ "Salvia nemorosa" ], response.parsed_body.dig("planting", "palette").map { _1["latinName"] }
  end

  test "a wrong name is refused with a message" do
    sign_in_as users(:michael)
    post map_plant_proposals_path(@map), params: { plant_proposal: { latin_name: "sauge" } }, as: :json
    assert_response :unprocessable_entity
    assert_match "nom latin", response.parsed_body["message"]
  end

  test "viewers and strangers cannot add a species" do
    sign_in_as users(:alice)
    post map_plant_proposals_path(@map), params: { plant_proposal: { latin_name: "Salvia nemorosa" } }, as: :json
    assert_response :forbidden
    sign_in_as users(:bob)
    get check_map_plant_proposals_path(@map, name: "Salvia nemorosa"), as: :json
    assert_response :not_found
    assert_not PlantSpecies.exists?(latin_name: "Salvia nemorosa")
  end
end
