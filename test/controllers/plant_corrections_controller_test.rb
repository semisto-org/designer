require "test_helper"

# « Suggérer une correction » from the species sheet, and the reviewer's answer.
class PlantCorrectionsControllerTest < ActionDispatch::IntegrationTest
  setup { @alder = plant_species(:alder) }

  test "a signed-in person suggests a correction from the sheet" do
    sign_in_as users(:alice)
    get plant_path(@alder)
    assert_response :success

    post plant_corrections_path(@alder), params: { correction: { field: "strata", proposed_value: "sub_canopy", note: "Taillé en cépée" } }
    assert_redirected_to plant_path(@alder)
    correction = PlantCorrection.sole
    assert_equal [ "web", "pending", "canopy" ], [ correction.origin, correction.status, correction.current_value ]

    post plant_corrections_path(@alder), params: { correction: { field: "strata", proposed_value: "nope" } }
    assert_equal 1, PlantCorrection.count
  end

  test "only catalogue reviewers see and answer the suggestions" do
    correction = @alder.corrections.create!(user: users(:alice), field: "strata", proposed_value: "sub_canopy")
    sign_in_as users(:alice)
    post accept_plant_correction_path(correction)
    assert_response :not_found

    users(:michael).update!(catalogue_reviewer: true)
    sign_in_as users(:michael)
    post accept_plant_correction_path(correction)
    assert_redirected_to catalogue_reviews_path(anchor: "corrections")
    assert_equal "sub_canopy", @alder.reload.strata

    other = @alder.corrections.create!(user: users(:alice), field: "other", note: "Fleurit en mars")
    post reject_plant_correction_path(other)
    assert_equal "rejected", other.reload.status
  end
end
