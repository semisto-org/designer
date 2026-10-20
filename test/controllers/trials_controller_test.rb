require "test_helper"
require_relative "../support/map_data_test_helper"

# « Et chez toi ? »: a map tried from an address, without an account, kept
# by signing up; the sign-up remembers the public map it came from.
class TrialsControllerTest < ActionDispatch::IntegrationTest
  include MapDataTestHelper

  setup do
    seed_wallonia_layers
    stub_identify("PLAN_REGLEMENT/CADMAP_PARCELLES", "identify_cadastre.json")
    @publication = MapPublication.publish!(maps(:ahinvaux), by: users(:michael), title: "Le jardin des 4 Sources")
  end

  def start_trial(from: @publication.token)
    post trials_path, params: { lng: 4.9055, lat: 50.3405, address: "Rue du Verger 12, 5530 Yvoir", from: }, as: :json
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
    assert_equal "Mon jardin à Yvoir", map.name
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
    assert_equal %w[signup trial_keep], flash[:inertia]["track"].map { _1["event"] }
  end

  test "an old account signing in is not counted as a sign-up" do
    start_trial
    users(:alice).update_columns(created_at: 1.year.ago)
    post magic_link_path(users(:alice).generate_token_for(:magic_link))
    assert_nil users(:alice).reload.source_publication
    assert_nil flash[:inertia]
  end
end
