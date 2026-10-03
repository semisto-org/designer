require "test_helper"

class OauthGrantTest < ActiveSupport::TestCase
  test "PKCE S256 verification and single redemption" do
    client = OauthClient.create!(name: "Claude", redirect_uris: [ "https://claude.ai/cb" ], token_endpoint_auth_method: "none")
    verifier = "a" * 64
    challenge = Base64.urlsafe_encode64(OpenSSL::Digest::SHA256.digest(verifier), padding: false)
    grant = OauthGrant.create!(user: users(:michael), oauth_client: client, redirect_uri: "https://claude.ai/cb", code_challenge: challenge, scopes: "maps:read")
    assert_equal grant, OauthGrant.find_by_code(grant.plaintext_code)
    assert grant.verify_pkce(verifier)
    refute grant.verify_pkce("b" * 64)
    refute grant.verify_pkce("short")
    assert grant.redeem!
    refute grant.redeem!
    travel OauthGrant::TTL + 1.second do
      assert grant.expired?
    end
  end
end
