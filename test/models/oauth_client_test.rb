require "test_helper"

class OauthClientTest < ActiveSupport::TestCase
  test "acceptable redirect URIs" do
    assert OauthClient.acceptable_redirect_uri?("https://claude.ai/api/mcp/auth_callback")
    assert OauthClient.acceptable_redirect_uri?("http://127.0.0.1:33418/callback")
    assert OauthClient.acceptable_redirect_uri?("cursor://anysphere.cursor-retrieval/oauth/callback")
    refute OauthClient.acceptable_redirect_uri?("http://claude.ai/callback")
    refute OauthClient.acceptable_redirect_uri?("javascript:alert(1)")
    refute OauthClient.acceptable_redirect_uri?("https://claude.ai/cb#frag")
    refute OauthClient.acceptable_redirect_uri?("/relative")
  end

  test "registration defaults to client_secret_basic as RFC 7591 says, and issues a secret" do
    client = OauthClient.register!("client_name" => "Agent", "redirect_uris" => [ "https://agent.example/cb" ])
    assert client.confidential?
    assert client.authenticate_secret(client.plaintext_secret)
    refute client.authenticate_secret("nope")
    assert_equal client.plaintext_secret, client.registration_response[:client_secret]
  end

  test "registration refuses unsupported grant or response types" do
    assert_raises(OauthClient::RegistrationError) do
      OauthClient.register!("redirect_uris" => [ "https://a.example/cb" ], "grant_types" => [ "password" ])
    end
    assert_raises(OauthClient::RegistrationError) do
      OauthClient.register!("redirect_uris" => [ "https://a.example/cb" ], "response_types" => [ "token" ])
    end
  end
end
