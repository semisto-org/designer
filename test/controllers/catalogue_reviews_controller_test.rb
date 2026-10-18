require "test_helper"
require_relative "../test_helpers/gbif_test_helper"

class CatalogueReviewsControllerTest < ActionDispatch::IntegrationTest
  include GbifTestHelper

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

  test "choosing another common name keeps the one the species had as a synonym" do
    Catalog::SpeciesWriter.new(source: "user", status: "to_verify").write(@species, {}, common_names: [ "Sauge Caradonna" ])
    sign_in_as @reviewer
    patch catalogue_review_path(@species), params: { review: { latin_name: "Salvia nemorosa", common_name: "Sauge des bois" } }
    @species.reload
    assert_equal "Sauge des bois", @species.common_name
    assert_equal [ "Sauge des bois", "Sauge Caradonna" ], @species.common_names.select { _1.language == "fr" }.map(&:name)
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

  test "GBIF checks an imported name and offers the French names it knows" do
    imported = PlantSpecies.create!(latin_name: "Ocimum kilimandscharicum", review_status: "proposed")
    Catalog::SpeciesWriter.new(source: "terranova", status: "to_verify").write(imported, {}, common_names: [ "Basilic perpétuel" ])
    stub_gbif("Ocimum kilimandscharicum" => gbif_accepted("Ocimum kilimandscharicum", key: 8344835))
    stub_gbif_common_names(8344835, [ [ "Basilic camphré", "fra", "Catalogue of Life" ], [ "basilic perpétuel", "fra", "Wikidata" ],
                                      [ "Kampferbasilikum", "deu", "Wikidata" ] ])

    sign_in_as users(:alice)
    post gbif_catalogue_review_path(imported), as: :json
    assert_response :not_found

    sign_in_as @reviewer
    post gbif_catalogue_review_path(imported), as: :json
    assert_response :success
    assert_equal "accepted", response.parsed_body.dig("match", "status")
    assert_equal [ [ "Basilic camphré", false ], [ "basilic perpétuel", true ] ],
                 response.parsed_body["commonNames"].map { [ _1["name"], _1["known"] ] }
    assert_equal [ "Catalogue of Life" ], response.parsed_body["commonNames"].first["sources"]
    assert_equal [ 8344835, "Lamiaceae" ], [ imported.reload.gbif_key, imported.family ]
  end

  test "an outdated name gets no key, and an unreachable GBIF says so" do
    stub_gbif("Salvia nemorossa" => gbif_synonym("Salvia nemorossa", "Salvia nemorosa", accepted_key: 77))
    stub_gbif_common_names(77, [ [ "Sauge des bois", "fra", "Catalogue of Life" ] ])
    sign_in_as @reviewer
    post gbif_catalogue_review_path(@species), as: :json
    assert_equal [ "synonym", "Salvia nemorosa" ], response.parsed_body["match"].values_at("status", "suggestedName")
    assert_equal [ "Sauge des bois" ], response.parsed_body["commonNames"].map { _1["name"] }
    assert_nil @species.reload.gbif_key

    Rails.cache.clear
    stub_request(:get, GbifTestHelper::MATCH).to_return(status: 503)
    post gbif_catalogue_review_path(@species), as: :json
    assert_equal({ "match" => { "status" => "unavailable" }, "commonNames" => [] }, response.parsed_body)
  end

  test "Jev checks the values in the background, once the key is set" do
    sign_in_as @reviewer
    previous = ENV["TYPESAFE_API_KEY"]
    ENV["TYPESAFE_API_KEY"] = nil
    post check_catalogue_reviews_path
    assert_redirected_to catalogue_reviews_path
    assert_nil @species.reload.values_check_requested_at

    ENV["TYPESAFE_API_KEY"] = "key"
    assert_enqueued_jobs 1, only: PlantValueCheckJob do
      post check_catalogue_reviews_path
    end
    assert_not_nil @species.reload.values_check_requested_at
    assert_no_enqueued_jobs(only: PlantValueCheckJob) { post check_catalogue_reviews_path } # already asked
    assert_enqueued_jobs(1, only: PlantValueCheckJob) { post check_catalogue_review_path(@species) }

    get catalogue_reviews_path, headers: inertia_headers
    proposal = response.parsed_body.dig("props", "proposals").sole
    assert_equal [ "unchecked", "pending" ], [ proposal["state"], proposal.dig("check", "state") ]
    assert_equal true, response.parsed_body.dig("props", "jevAvailable")
  ensure
    ENV["TYPESAFE_API_KEY"] = previous
  end

  test "the queue opens on the species ready to accept" do
    ready = PlantSpecies.create!(latin_name: "Ocimum kilimandscharicum", review_status: "proposed", gbif_key: 8344835,
                                 values_checked_at: Time.current)
    ready.value_checks.create!(field: "foliage_type", verdict: "confirmed", source: "pfaf")
    doubtful = PlantSpecies.create!(latin_name: "Salvia pratensis", review_status: "proposed", gbif_key: 1, values_checked_at: Time.current)
    doubtful.value_checks.create!(field: "plant_type", verdict: "contradicted", source_value: "herbaceous", source: "wikipedia")

    sign_in_as @reviewer
    get catalogue_reviews_path, headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal [ [ "Ocimum kilimandscharicum", "ready" ], [ "Salvia pratensis", "attention" ], [ "Salvia nemorossa", "unchecked" ] ],
                 props["proposals"].map { _1.values_at("latinName", "state") }
    assert_equal({ "ready" => 1, "attention" => 1, "unchecked" => 1 }, props["summary"])
    assert_equal "herbaceous", props["proposals"].second.dig("check", "results").sole["sourceValue"]
  end

  test "accepting makes confirmed values sourced and takes the values the reviewer chose" do
    Catalog::SpeciesWriter.new(source: "terranova", status: "to_verify").write(@species, { "foliage_type" => "deciduous", "height_max_m" => 1.0 })
    @species.update!(values_checked_at: Time.current)
    @species.value_checks.create!(field: "foliage_type", verdict: "confirmed", source: "wikipedia", url: "https://en.wikipedia.org/wiki/Salvia")
    @species.value_checks.create!(field: "height_max_m", verdict: "contradicted", source_value: 0.6, source: "pfaf", url: "https://pfaf.org/x")
    @species.value_checks.create!(field: "strata", verdict: "contradicted", source_value: "shrub", source: "pfaf")

    sign_in_as @reviewer
    patch catalogue_review_path(@species), params: { review: { latin_name: "Salvia nemorosa", take: [ "height_max_m" ] } }
    @species.reload
    assert_equal [ "sourced", "wikipedia", "https://en.wikipedia.org/wiki/Salvia" ], @species.provenance_for("foliage_type").values_at(:status, :source, :url)
    assert_equal 0.6, @species.height_max_m
    assert_equal [ "sourced", "pfaf" ], @species.provenance_for("height_max_m").values_at(:status, :source)
    assert_equal "herbaceous", @species.strata, "a contradiction not taken changes nothing"
  end
end
