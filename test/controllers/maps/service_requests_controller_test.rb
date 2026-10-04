require "test_helper"

class Maps::ServiceRequestsControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  setup { @map = maps(:ahinvaux) }

  def order(overrides = {})
    { service_request: { kind: "order_plants", contact_consent: true,
                         payload: { plants: [ { name: "Noyer commun", quantity: 3 } ], desired_period: "Novembre 2026", phone: "0470 00 00 00" } }.deep_merge(overrides) }
  end

  test "requires sign in and map access" do
    get map_service_requests_path(@map)
    assert_redirected_to new_session_path
    sign_in_as users(:bob)
    get map_service_requests_path(@map), as: :json
    assert_response :not_found
    post map_service_requests_path(@map), params: order, as: :json
    assert_response :not_found
  end

  test "the owner gets the prefill, the schema and their requests" do
    @map.features.create!(layer: "plants", kind: "tree", name: "Noyer", geometry: point)
    sign_in_as users(:michael)
    get map_service_requests_path(@map), as: :json
    assert_response :success
    body = response.parsed_body
    assert_equal true, body["canCreate"]
    assert_equal [ { "name" => "Noyer", "quantity" => 1 } ], body.dig("prefill", "plants")
    assert_equal "features", body.dig("prefill", "plantsSource")
    assert_equal %w[co_management implementation order_plants], body["schema"].keys.sort
    assert_equal [], body["requests"]
  end

  test "other members see the requests but cannot send or prefill" do
    @map.service_requests.create!(user: users(:michael), kind: "co_management", contact_consent: true, payload: { "message" => "Salut" })
    sign_in_as users(:alice)
    get map_service_requests_path(@map), as: :json
    assert_response :success
    body = response.parsed_body
    assert_equal false, body["canCreate"]
    assert_equal 1, body["requests"].size
    assert_not body.key?("prefill")
    post map_service_requests_path(@map), params: order, as: :json
    assert_response :forbidden
    assert_equal 1, ServiceRequest.count
  end

  test "an editor cannot send a request either: the owner shares their map" do
    @map.memberships.create!(user: users(:bob), role: "editor")
    sign_in_as users(:bob)
    post map_service_requests_path(@map), params: order, as: :json
    assert_response :forbidden
  end

  test "the owner sends an order: stored, mails enqueued, listed" do
    sign_in_as users(:michael)
    assert_enqueued_emails 2 do
      assert_difference -> { ServiceRequest.count }, 1 do
        post map_service_requests_path(@map), params: order, as: :json
      end
    end
    assert_response :created
    created = ServiceRequest.last
    assert_equal users(:michael), created.user
    assert_equal @map, created.map
    assert_equal "new", created.status
    assert_equal [ { "name" => "Noyer commun", "quantity" => 3 } ], created.payload["plants"]
    assert created.contact_consent
    assert_equal created.id, response.parsed_body.dig("request", "id")
    assert_equal [ created.id ], response.parsed_body["requests"].map { _1["id"] }
  end

  test "the mails go to Semisto and to the person" do
    sign_in_as users(:michael)
    perform_enqueued_jobs do
      post map_service_requests_path(@map), params: order, as: :json
    end
    to_semisto, to_user = ActionMailer::Base.deliveries.last(2)
    assert_equal [ "designer@semisto.org" ], to_semisto.to
    assert_equal [ "michael@example.org" ], to_user.to
  end

  test "without explicit consent nothing is created or sent" do
    sign_in_as users(:michael)
    assert_no_enqueued_emails do
      assert_no_difference -> { ServiceRequest.count } do
        post map_service_requests_path(@map), params: order(contact_consent: false), as: :json
      end
    end
    assert_response :unprocessable_entity
    assert_includes response.parsed_body["message"], "accepte que Semisto consulte ta carte"
  end

  test "an unknown kind or a payload that does not fit is refused" do
    sign_in_as users(:michael)
    post map_service_requests_path(@map), params: order(kind: "spam"), as: :json
    assert_response :unprocessable_entity
    post map_service_requests_path(@map), params: order(payload: { delivery: "drone" }), as: :json
    assert_response :unprocessable_entity
    assert_equal 0, ServiceRequest.count
  end

  test "an implementation request carries the place and the plant list" do
    sign_in_as users(:michael)
    post map_service_requests_path(@map), params: { service_request: {
      kind: "implementation", contact_consent: true,
      payload: { surface_m2: 1200, commune: "Yvoir", address: "Rue des Bois 3", budget: "up_to_5000", include_plant_list: true,
                 plants: [ { name: "Noisetier", quantity: 10 } ], message: "Plantation cet hiver" }
    } }, as: :json
    assert_response :created
    payload = ServiceRequest.last.payload
    assert_equal 1200, payload["surface_m2"]
    assert_equal "up_to_5000", payload["budget"]
    assert_equal true, payload["include_plant_list"]
    assert_equal "Noisetier", payload.dig("plants", 0, "name")
  end

  test "a co-management request" do
    sign_in_as users(:michael)
    post map_service_requests_path(@map), params: { service_request: { kind: "co_management", contact_consent: true, payload: { scope: %w[pruning harvest], frequency: "seasonal" } } }, as: :json
    assert_response :created
    assert_equal %w[pruning harvest], ServiceRequest.last.payload["scope"]
  end

  test "free text only is enough for an order, a request with nothing is not" do
    sign_in_as users(:michael)
    post map_service_requests_path(@map), params: { service_request: { kind: "order_plants", contact_consent: true, payload: { plants_free_text: "Une haie fruitière de 40 m" } } }, as: :json
    assert_response :created
    post map_service_requests_path(@map), params: { service_request: { kind: "order_plants", contact_consent: true, payload: { message: "Bonjour" } } }, as: :json
    assert_response :unprocessable_entity
  end

  test "sending a request lets Semisto staff read the map" do
    admin = User.create!(email_address: "staff@example.org", admin: true)
    assert_nil @map.role_for(admin)
    sign_in_as users(:michael)
    post map_service_requests_path(@map), params: order, as: :json
    assert_equal "viewer", @map.reload.role_for(admin)
  end
end
