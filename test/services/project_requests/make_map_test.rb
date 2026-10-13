require "test_helper"
require_relative "../../support/map_data_test_helper"
require_relative "../../test_helpers/teams_test_helper"

class ProjectRequests::MakeMapTest < ActiveSupport::TestCase
  include MapDataTestHelper
  include ActionDispatch::TestProcess::FixtureFile

  setup do
    seed_wallonia_layers
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    @team = make_team("Semisto", admin: users(:michael), members: [ users(:bob) ])
    @form = RequestForm.create!(owner: @team)
    @request = ProjectRequests::Submit.new(@form,
      { name: "Marie Dupont", email: "marie@example.org", address: "Rue du Bois 1, 5530 Yvoir", message: "Un verger",
        answers: { "profile" => "individual", "budget" => "up_to_5000", "slope" => "gentle" },
        parcels: [ { capakey: "92142B0247/00X009", lng: 4.9055, lat: 50.3405 } ] }.with_indifferent_access,
      photos: [ fixture_file_upload("terrain.jpg", "image/jpeg") ]).call
  end

  test "a map of the place, in the team, with the sheet's first answers and the photos" do
    map = ProjectRequests::MakeMap.new(@request, users(:bob)).call
    assert_equal users(:bob), map.owner
    assert_equal @team, map.organization
    assert_equal "Demande de Marie Dupont", map.name
    assert_equal regions(:wallonia), map.region
    assert_equal [ "92142B0247/00X009" ], map.parcels
    assert_in_delta 7_915, map.area_m2, 100
    sheet = map.project_sheet
    assert_equal "Marie Dupont", sheet.section("who")["people"].first["name"]
    assert_equal "up_to_5000", sheet.section("budget")["initial"]
    assert_equal "gentle", sheet.section("constraints")["slope"]
    assert_equal 1, map.photos.count
    assert_equal map, @request.reload.map

    assert_no_difference -> { Map.count } do
      assert_equal map, ProjectRequests::MakeMap.new(@request, users(:michael)).call
    end
  end
end
