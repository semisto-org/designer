require "test_helper"
require_relative "../support/map_data_test_helper"

class MapTrialTest < ActiveSupport::TestCase
  include MapDataTestHelper

  setup do
    seed_wallonia_layers
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
  end

  test "starts on the parcel under the address, for 48 hours" do
    trial = MapTrial.start(lng: 4.9055, lat: 50.3405, address: "Rue du Verger 12, 5530 Yvoir")
    assert_equal "wallonia", trial.region.key
    assert_equal [ "92142B0247/00X009" ], trial.parcels.map { _1["capakey"] }
    assert_equal "MultiPolygon", trial.boundary.geometry_type.type_name
    assert_in_delta 7_900, trial.area_m2, 400
    assert_in_delta 48.hours.from_now, trial.expires_at, 5
    assert trial.live?
    assert_equal 32, trial.token.size
  end

  test "a tap on a parcel already in takes it out" do
    trial = MapTrial.start(lng: 4.9055, lat: 50.3405)
    assert trial.toggle_parcel(4.9055, 50.3405)
    assert_empty trial.parcels
    assert_nil trial.boundary
    assert_nil trial.area_m2
  end

  test "an unreachable cadastre leaves a trial without parcel" do
    WebMock.reset!
    stub_request(:any, /geoservices\.wallonie\.be/).to_return(status: 503)
    trial = MapTrial.start(lng: 4.9055, lat: 50.3405)
    assert trial.persisted?
    assert_empty trial.parcels
  end

  test "a region without cadastre: the address alone" do
    regions(:wallonia).layers.where(key: "cadastre").delete_all
    trial = MapTrial.start(lng: 4.9055, lat: 50.3405)
    assert_nil trial.boundary
    assert_equal false, trial.as_inertia[:cadastre]
    assert_not trial.toggle_parcel(4.9055, 50.3405)
  end

  test "a source publication counts only while it is live" do
    publication = MapPublication.publish!(maps(:ahinvaux), by: users(:michael))
    assert_equal publication, MapTrial.start(lng: 4.9055, lat: 50.3405, source_publication: publication).source_publication
    publication.unpublish!
    assert_nil MapTrial.start(lng: 4.9055, lat: 50.3405, source_publication: publication).source_publication
  end

  test "adopting makes it the user's map, once, and remembers where they came from" do
    publication = MapPublication.publish!(maps(:ahinvaux), by: users(:michael))
    trial = MapTrial.start(lng: 4.9055, lat: 50.3405, address: "Rue du Verger 12, 5530 Yvoir", source_publication: publication)
    user = User.create!(email_address: "nouvelle@example.org")

    map = assert_difference -> { Map.count }, 1 do
      trial.adopt!(user)
    end
    assert_equal user, map.owner
    assert_equal "Le terrain d'Yvoir", map.name
    assert_equal [ "92142B0247/00X009" ], map.parcels
    assert_equal "wallonia", map.region.key
    assert_in_delta trial.area_m2, map.reload.area_m2, 1
    assert_equal publication, user.reload.source_publication
    assert_not trial.reload.live?
    assert_no_difference -> { Map.count } do
      assert_equal map, trial.adopt!(user)
    end
  end

  test "adopting respects the plan's limit" do
    trial = MapTrial.start(lng: 4.9055, lat: 50.3405)
    scope = Struct.new(:can_create_map?).new(false)
    original = Billing::Scope.method(:own)
    Billing::Scope.define_singleton_method(:own) { |*| scope }
    assert_raises(MapTrial::LimitReached) { trial.adopt!(users(:alice)) }
  ensure
    Billing::Scope.define_singleton_method(:own, original) if original
  end

  test "expired trials are swept" do
    MapTrial.start(lng: 4.9055, lat: 50.3405).update!(expires_at: 1.minute.ago)
    live = MapTrial.start(lng: 4.9055, lat: 50.3405)
    assert_equal [ live ], MapTrial.live.to_a
    MapTrial.expired.delete_all
    assert_equal [ live ], MapTrial.all.to_a
  end

  test "the name it proposes comes from the town, with French elision" do
    trial = MapTrial.new(address: "Rue de la Gare 3, 5530 Purnode")
    assert_equal "Le terrain de Purnode", trial.proposed_name
    trial.address = "Chemin des Prés, 5530 Yvoir"
    assert_equal "Le terrain d'Yvoir", trial.proposed_name
    trial.address = "L-9999 Église"
    assert_equal "Le terrain d'Église", trial.proposed_name
    trial.address = nil
    assert_equal "Mon terrain", trial.proposed_name
  end

  test "where the address was typed: a live public map wins, else the home page or /essai" do
    assert_equal "home", MapTrial.start(lng: 4.9055, lat: 50.3405, origin: "home").origin
    assert_equal "direct", MapTrial.start(lng: 4.9055, lat: 50.3405, origin: "elsewhere").origin
    publication = MapPublication.publish!(maps(:ahinvaux), by: users(:michael), title: "Le jardin des 4 Sources")
    assert_equal "public_map", MapTrial.start(lng: 4.9055, lat: 50.3405, origin: "home", source_publication: publication).origin
  end

  test "claimed by an e-mail: the account exists at once and the trial waits for it" do
    trial = MapTrial.start(lng: 4.9055, lat: 50.3405)
    user = assert_difference -> { User.count }, 1 do
      trial.claim!("  Nouvelle@Example.org ")
    end
    assert_equal "nouvelle@example.org", user.email_address
    assert trial.claimed_by?(user)
    assert_not trial.claimed_by?(users(:alice))
    assert_no_difference -> { User.count } do
      assert_equal users(:alice), trial.claim!(users(:alice).email_address)
    end
    assert_raises(ActiveRecord::RecordInvalid) { trial.claim!("not an e-mail") }
  end
end
