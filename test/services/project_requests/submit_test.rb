require "test_helper"
require_relative "../../support/map_data_test_helper"
require_relative "../../test_helpers/teams_test_helper"

class ProjectRequests::SubmitTest < ActiveSupport::TestCase
  include MapDataTestHelper
  include ActionDispatch::TestProcess::FixtureFile
  include ActionMailer::TestHelper

  setup do
    seed_wallonia_layers
    @team = make_team("Semisto", admin: users(:michael), members: [ users(:bob) ])
    @form = RequestForm.create!(owner: @team)
  end

  def params(extra = {})
    { name: "Marie Dupont", email: "marie@example.org", phone: "0470 12 34 56", address: "Rue du Bois 1, 5530 Yvoir",
      message: "Un jardin-forêt familial", answers: { "profile" => "individual", "budget" => "up_to_5000" } }.merge(extra).with_indifferent_access
  end

  test "parcels picked on the map become the request's outline; the team and the prospect are told" do
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    request = nil
    assert_enqueued_emails 3 do
      request = ProjectRequests::Submit.new(@form, params(parcels: [ { capakey: "92142B0247/00X009", lng: 4.9055, lat: 50.3405 } ]),
        photos: [ fixture_file_upload("terrain.jpg", "image/jpeg") ]).call
    end
    assert_equal regions(:wallonia), request.region
    assert_equal [ "92142B0247/00X009" ], request.parcels.map { _1["capakey"] }
    assert_equal "Parcelle 247X9, section B", request.parcels.first["label"]
    assert_equal "MultiPolygon", request.boundary.geometry_type.type_name
    assert_in_delta 7_915, request.area_m2, 100
    assert_equal 1, request.photos.count
    assert_equal "new", request.status
  end

  test "an unreachable cadastre keeps the parcels without an outline; a pin alone is a place too" do
    stub_request(:get, SPW_REST).to_timeout
    request = ProjectRequests::Submit.new(@form, params(parcels: [ { capakey: "92142B0247/00X009", lng: 4.9055, lat: 50.3405 } ])).call
    assert_nil request.boundary
    assert_equal [ "92142B0247/00X009" ], request.parcels.map { _1["capakey"] }
    assert_in_delta 4.9055, request.center.x, 0.0001

    pinned = ProjectRequests::Submit.new(@form, params(center: [ 4.9, 50.3 ], parcels: "junk")).call
    assert_equal [], pinned.parcels
    assert_in_delta 50.3, pinned.center.y, 0.0001
  end

  test "invalid answers or details are refused, nothing is saved" do
    assert_no_difference -> { ProjectRequest.count } do
      error = assert_raises(ProjectRequests::Submit::Invalid) { ProjectRequests::Submit.new(@form, params(answers: { "budget" => "lots" })).call }
      assert error.errors[:answers].key?("answers.budget")
      assert_raises(ProjectRequests::Submit::Invalid) { ProjectRequests::Submit.new(@form, params(email: "nope")).call }
    end
  end
end
