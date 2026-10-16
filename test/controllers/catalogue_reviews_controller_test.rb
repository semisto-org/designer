require "test_helper"

class CatalogueReviewsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @species = PlantSpecies.create!(latin_name: "Salvia nemorossa", review_status: "proposed", proposed_by: users(:michael),
                                    proposed_map: @map)
    Catalog::SpeciesWriter.new(source: "user", status: "to_verify").write(@species, { "strata" => "herbaceous", "height_max_m" => 0.6 })
    @map.palette_items.create!(species: @species)
    @reviewer = users(:bob)
    @reviewer.update!(catalogue_reviewer: true)
  end

  test "only catalogue reviewers and admins see the queue" do
    sign_in_as users(:alice)
    get catalogue_reviews_path
    assert_response :not_found
    post reject_catalogue_review_path(@species)
    assert_response :not_found

    sign_in_as @reviewer
    get catalogue_reviews_path, headers: inertia_headers
    assert_response :success
    assert_equal "catalogue_reviews/index", response.parsed_body["component"]
    proposal = response.parsed_body.dig("props", "proposals").sole
    assert_equal "Salvia nemorossa", proposal["latinName"]
    assert_equal "Michael", proposal["proposedBy"]
    assert_equal [ @map.name ], proposal["maps"].map { _1["name"] }
    assert_equal({ "strata" => "user", "height_max_m" => "user" }, proposal["values"].to_h { [ _1["field"], _1["source"] ] })

    admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    sign_in_as admin
    get catalogue_reviews_path
    assert_response :success
  end

  test "accepting with a corrected name opens the species to everyone" do
    sign_in_as @reviewer
    patch catalogue_review_path(@species), params: { review: { latin_name: "Salvia nemorosa", common_name: "Sauge des bois", strata: "herbaceous" } }
    assert_redirected_to catalogue_reviews_path
    @species.reload
    assert_equal "reviewed", @species.review_status
    assert_equal "Salvia nemorosa", @species.latin_name
    assert_equal "Sauge des bois", @species.common_name
    assert_equal @reviewer, @species.reviewed_by
    assert @species.visible_to?(users(:alice))
  end

  test "a name that already exists is not accepted twice" do
    sign_in_as @reviewer
    patch catalogue_review_path(@species), params: { review: { latin_name: "Malus domestica" } }
    assert_redirected_to catalogue_reviews_path
    assert_equal "proposed", @species.reload.review_status
  end

  test "merging folds the proposal into a catalogue species" do
    sign_in_as @reviewer
    post merge_catalogue_review_path(@species), params: { target_id: plant_species(:comfrey).id }
    assert_redirected_to catalogue_reviews_path
    assert_not PlantSpecies.exists?(@species.id)
    assert_equal [ plant_species(:comfrey).id ], @map.palette_items.pluck(:species_id)

    other = PlantSpecies.create!(latin_name: "Salvia pratensiss", review_status: "proposed")
    post merge_catalogue_review_path(other), params: { target_id: other.id }
    assert PlantSpecies.exists?(other.id)
  end

  test "keeping a species off the catalogue leaves it on its maps" do
    sign_in_as @reviewer
    post reject_catalogue_review_path(@species)
    assert_equal "rejected", @species.reload.review_status
    assert @map.palette_items.exists?(species: @species)
    assert @species.visible_to?(users(:alice)), "a viewer of the map still sees it"
    assert_not @species.visible_to?(User.create!(email_address: "x@example.org"))
  end
end
