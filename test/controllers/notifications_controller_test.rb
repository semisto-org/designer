require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class NotificationsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @michael = users(:michael)
    @chris = add_member(@map, make_user("Chris"), "editor")
  end

  test "the bell lists unread discussions and marks them all read" do
    Comment.create!(commentable: @map, author: @chris, body: "Dis-moi quand c'est fait")
    sign_in_as @michael
    get "/notifications", as: :json
    assert_response :success
    assert_equal 1, json["total"]
    assert_equal @map.name, json["items"].first["mapName"]

    post "/notifications/read_all", as: :json
    assert_equal 0, json["total"]
    get "/notifications", as: :json
    assert_empty json["items"]
  end

  test "preferences: the three switches of « Mon compte »" do
    sign_in_as @michael
    patch "/notification_preference", params: { app: false, push: "false" }, as: :json
    assert_response :success
    assert_equal({ "app" => false, "email" => true, "push" => false, "phones" => 0 }, json)
    patch "/notification_preference", params: { email: false }, as: :json
    assert_not @michael.reload.comment_emails
    assert @michael.reload.chat_notify_app == false

    get "/account", headers: inertia_headers
    assert_equal false, response.parsed_body.dig("props", "account", "notifications", "email")
  end

  test "a map's level is chosen from its discussion" do
    sign_in_as @chris
    patch "/maps/#{@map.id}/comments/subscribe", params: { commentable_type: "Map", commentable_id: @map.id, level: "mentions" }, as: :json
    assert_response :success
    assert_equal "mentions", json["level"]
    get "/maps/#{@map.id}/comments", params: { commentable_type: "Map", commentable_id: @map.id }, as: :json
    assert_equal "mentions", json["level"]

    patch "/maps/#{@map.id}/comments/subscribe", params: { commentable_type: "Map", commentable_id: @map.id, level: "loud" }, as: :json
    assert_response :unprocessable_entity
  end

  test "the phone app registers and forgets its push token" do
    token = OauthAccessToken.issue!(user: @michael, client: MobileApp.client, scopes: MobileApp::SCOPES, resource: nil).plaintext_token
    headers = { "Authorization" => "Bearer #{token}" }
    post "/api/v1/push_devices", params: { token: "ExponentPushToken[abc]", platform: "ios" }, headers:, as: :json
    assert_response :created
    assert_equal [ "ios" ], @michael.push_devices.pluck(:platform)

    post "/api/v1/push_devices", params: { token: "nope" }, headers:, as: :json
    assert_response :unprocessable_entity

    delete "/api/v1/push_devices", params: { token: "ExponentPushToken[abc]" }, headers:, as: :json
    assert_response :no_content
    assert_empty @michael.push_devices

    post "/api/v1/push_devices", params: { token: "ExponentPushToken[abc]" }, as: :json
    assert_response :unauthorized
  end
end
