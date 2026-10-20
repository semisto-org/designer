require "test_helper"
require_relative "../support/map_data_test_helper"

# « Et chez toi ? »: a map tried from an address, without an account, kept
# by signing up; the sign-up remembers the public map it came from.
class TrialsControllerTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper
  include ActionMailer::TestHelper

  setup do
    seed_wallonia_layers
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    @publication = MapPublication.publish!(maps(:ahinvaux), by: users(:michael), title: "Le jardin des 4 Sources")
  end

  def start_trial(from: @publication.token, via: nil)
    post trials_path, params: { lng: 4.9055, lat: 50.3405, address: "Rue du Verger 12, 5530 Yvoir", from:, via: }.compact, as: :json
    assert_response :created
    MapTrial.find_by!(token: response.parsed_body["token"])
  end

  test "the address page opens without an account, with the map that sent the visitor" do
    get new_trial_path(from: @publication.token), headers: inertia_headers
    assert_response :success
    assert_equal "trials/new", response.parsed_body["component"]
    assert_equal "Le jardin des 4 Sources", response.parsed_body["props"]["from"]["title"]
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]

    get new_trial_path(from: "not-a-real-token-at-all"), headers: inertia_headers
    assert_nil response.parsed_body["props"]["from"]
  end

  test "a trial starts on the parcel and shows what the region knows, never a sensitive layer" do
    trial = start_trial
    assert_equal @publication, trial.source_publication
    get trial_path(trial.token), headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal "trials/show", response.parsed_body["component"]
    assert_equal [ "92142B0247/00X009" ], props["trial"]["parcels"].map { _1["capakey"] }
    assert_equal "cadastre", props["cadastreLayer"]
    assert_includes props["knows"], "Carte des sols"
    assert_not_includes props["knows"], "Plan cadastral"
    assert_equal "Le jardin des 4 Sources", props["from"]["title"]
  end

  test "a place that is no place is refused" do
    post trials_path, params: { lng: "east", lat: 50 }, as: :json
    assert_response :unprocessable_entity
  end

  test "the reading, and a tap that drops the parcel" do
    trial = start_trial
    get trial_reading_path(trial.token), as: :json
    assert_response :success
    assert_in_delta 7_900, response.parsed_body["reading"]["area_m2"], 400

    post trial_parcel_path(trial.token), params: { lng: 4.9055, lat: 50.3405 }, as: :json
    assert_response :success
    assert_empty response.parsed_body["trial"]["parcels"]
  end

  test "an expired trial sends back to the address page" do
    trial = start_trial
    trial.update!(expires_at: 1.minute.ago)
    get trial_path(trial.token)
    assert_redirected_to new_trial_path
    get trial_reading_path(trial.token), as: :json
    assert_response :gone
  end

  test "kept while signed in: it becomes a map at once" do
    trial = start_trial
    sign_in_as users(:alice)
    assert_difference -> { users(:alice).owned_maps.count }, 1 do
      post keep_trial_path(trial.token)
    end
    map = trial.reload.adopted_map
    assert_redirected_to map_path(map)
    assert_equal "Le terrain d'Yvoir", map.name
    # The kept trial now leads to its map.
    get trial_path(trial.token)
    assert_redirected_to map_path(map)
  end

  test "kept by a visitor: sign up, come back, the map is theirs and remembers its source" do
    trial = start_trial
    post keep_trial_path(trial.token)
    assert_redirected_to new_session_path

    user = User.create!(email_address: "nouvelle@example.org")
    post magic_link_path(user.generate_token_for(:magic_link))
    assert_redirected_to trial_url(trial.token)
    assert_equal @publication, user.reload.source_publication
    assert_equal [ { "event" => "signup", "props" => { "via" => "trial" } } ], flash[:inertia]["track"]

    assert_difference -> { user.owned_maps.count }, 1 do
      get trial_path(trial.token)
    end
    assert_redirected_to map_path(trial.reload.adopted_map)
    assert_equal [ "signup", [ "trial_keep", { "from" => "public_map" } ] ], flash[:inertia]["track"].map { |e| e["props"]&.key?("from") ? [ e["event"], e["props"] ] : e["event"] }
  end

  test "an old account signing in is not counted as a sign-up" do
    start_trial
    users(:alice).update_columns(created_at: 1.year.ago)
    post magic_link_path(users(:alice).generate_token_for(:magic_link))
    assert_nil users(:alice).reload.source_publication
    assert_nil flash[:inertia]
  end

  test "started from the home page, the trial remembers it" do
    trial = start_trial(from: nil, via: "home")
    assert_equal "home", trial.origin
    get trial_path(trial.token), headers: inertia_headers
    assert_equal "Le terrain d'Yvoir", response.parsed_body["props"]["trial"]["name"]
  end

  test "« Garder ce carnet » with an e-mail: one gesture, and the link keeps it on another device" do
    trial = start_trial(from: nil, via: "home")
    assert_enqueued_emails 1 do
      post keep_trial_path(trial.token), params: { email_address: "Nouvelle@Example.org" }
    end
    assert_redirected_to trial_path(trial.token, sent: 1)
    user = User.find_by!(email_address: "nouvelle@example.org")
    assert_equal user, trial.reload.claimant
    assert_equal [ { "event" => "trial_keep_email", "props" => { "from" => "home" } } ], flash[:inertia]["track"]

    get trial_path(trial.token, sent: 1), headers: inertia_headers
    assert_equal "nouvelle@example.org", response.parsed_body["props"]["sentTo"]

    # The link opened on a phone: a browser that never saw the trial.
    reset!
    post magic_link_path(user.generate_token_for(:magic_link), return_to: trial_path(trial.token))
    assert_redirected_to trial_path(trial.token)
    assert_difference -> { user.owned_maps.count }, 1 do
      get trial_path(trial.token)
    end
    map = trial.reload.adopted_map
    assert_redirected_to map_path(map)
    assert_equal "Le terrain d'Yvoir", map.name
  end

  test "« Garder ce carnet » with the code typed on the trial itself" do
    trial = start_trial
    post keep_trial_path(trial.token), params: { email_address: "nouvelle@example.org" }
    user = User.find_by!(email_address: "nouvelle@example.org")
    code = user.issue_sign_in_code!
    post session_code_path, params: { email_address: user.email_address, code: }
    assert_redirected_to trial_url(trial.token)
    follow_redirect!
    assert_redirected_to map_path(trial.reload.adopted_map)
  end

  test "an e-mail that is no e-mail stays on the trial" do
    trial = start_trial
    assert_no_enqueued_emails do
      post keep_trial_path(trial.token), params: { email_address: "pas une adresse" }
    end
    assert_redirected_to trial_path(trial.token)
    assert_nil trial.reload.claimant
  end

  test "someone else signed in does not get a trial claimed by another address" do
    trial = start_trial
    post keep_trial_path(trial.token), params: { email_address: "nouvelle@example.org" }
    reset!
    sign_in_as users(:alice)
    get trial_path(trial.token), headers: inertia_headers
    assert_response :success
    assert_nil trial.reload.adopted_map
  end
end
