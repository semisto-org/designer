require "test_helper"

class Admin::CatalogueControllerTest < ActionDispatch::IntegrationTest
  test "regular users get a 404" do
    sign_in_as users(:michael)
    get admin_catalogue_path
    assert_response :not_found
  end

  test "shows how complete each field is, and the most used sheets to complete" do
    plant_species(:apple).record_provenance!(%w[hardiness_zone], source: "manual", status: "sourced")
    maps(:ahinvaux).palette_items.create!(species: plant_species(:apple))
    maps(:ahinvaux).palette_items.create!(species: plant_species(:robinia))

    sign_in_as User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    get admin_catalogue_path, headers: inertia_headers
    assert_response :success
    assert_equal "admin/catalogue/show", response.parsed_body["component"]
    coverage = response.parsed_body.dig("props", "coverage")
    reviewed = PlantSpecies.reviewed.count
    assert_equal reviewed, coverage["total"]
    assert_equal 2, coverage["usedTotal"]

    zone = coverage["rows"].find { |r| r["field"] == "hardiness_zone" }
    assert zone["decidesFit"]
    assert_equal 1, zone["sourced"]
    assert_equal reviewed, zone["sourced"] + zone["toVerify"] + zone["empty"]
    assert_equal 2, zone["usedFilled"]

    robinia = coverage["toComplete"].find { |s| s["latinName"] == "Robinia pseudoacacia" }
    assert_includes robinia["missing"], "exposures"
    assert_not_includes robinia["missing"], "hardiness_zone"
  end
end
