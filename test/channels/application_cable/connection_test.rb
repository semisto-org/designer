require "test_helper"

class ApplicationCable::ConnectionTest < ActionCable::Connection::TestCase
  test "connects with a session cookie" do
    session = users(:alice).sessions.create!
    cookies.signed[:session_id] = session.id
    connect
    assert_equal users(:alice), connection.current_user
  end

  test "connects the phone app with its bearer token" do
    token = OauthAccessToken.issue!(user: users(:michael), client: MobileApp.client, scopes: MobileApp::SCOPES, resource: nil)
    connect headers: { "Authorization" => "Bearer #{token.plaintext_token}" }
    assert_equal users(:michael), connection.current_user
  end

  test "rejects a bearer token that is not the phone app's" do
    assert_reject_connection { connect headers: { "Authorization" => "Bearer not-a-token" } }
  end

  test "rejects anonymous connections" do
    assert_reject_connection { connect }
  end
end
