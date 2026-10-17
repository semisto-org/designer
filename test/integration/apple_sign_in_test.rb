require "test_helper"
require "rack/test"

# Sign in with Apple: the return page that re-posts Apple's answer, the
# callback that signs in, and the whole OmniAuth round trip with our options.
class AppleSignInTest < ActionDispatch::IntegrationTest
  def apple_auth(uid: "001234.abcd", email: "apple@example.org", name: "Anne Pomme")
    OmniAuth::AuthHash.new(provider: "apple", uid:, info: { email:, name: }.compact)
  end

  def with_auth(auth)
    Rails.application.env_config["omniauth.auth"] = auth
    yield
  ensure
    Rails.application.env_config.delete("omniauth.auth")
  end

  test "the return page re-posts Apple's answer from our origin, without touching the session" do
    post "/auth/apple/return", params: { code: "c0de", state: "st4te", user: '{"name":{"firstName":"Anne"}}', other: "dropped" }
    assert_response :success
    assert_includes response.body, %(action="/auth/apple/callback")
    assert_includes response.body, %(name="code" value="c0de")
    assert_includes response.body, %(name="state" value="st4te")
    assert_includes response.body, %(name="user" value="{&quot;name&quot;:{&quot;firstName&quot;:&quot;Anne&quot;}}")
    assert_not_includes response.body, "dropped"
    assert_nil response.headers["Set-Cookie"].presence
  end

  test "a first sign-in creates the account with the name Apple sends once" do
    with_auth(apple_auth) do
      assert_difference -> { User.count } do
        post "/auth/apple/callback"
      end
    end
    user = User.find_by!(apple_uid: "001234.abcd")
    assert_equal "apple@example.org", user.email_address
    assert_equal "Anne Pomme", user.name
    assert_redirected_to root_url
    assert cookies[:session_id].present?
  end

  test "a known Apple id signs in even when Apple sends no name, and keeps the name" do
    users(:michael).update!(apple_uid: "001234.abcd")
    with_auth(apple_auth(email: "relay@privaterelay.appleid.com", name: nil)) do
      assert_no_difference -> { User.count } do
        post "/auth/apple/callback"
      end
    end
    assert_equal "Michael", users(:michael).reload.name
    assert_equal "michael@example.org", users(:michael).email_address
    assert cookies[:session_id].present?
  end

  test "an existing account with the same e-mail is linked to Apple" do
    with_auth(apple_auth(email: "Michael@example.org")) { post "/auth/apple/callback" }
    assert_equal "001234.abcd", users(:michael).reload.apple_uid
  end

  test "a failed Apple sign-in says so" do
    get "/auth/failure", params: { strategy: "apple", message: "invalid_credentials" }
    assert_redirected_to new_session_path
    assert_equal I18n.t("sessions.apple_failed"), flash[:alert]
  end

  test "the private key may be pasted with escaped line breaks" do
    assert_equal "a\nb", AppleSignIn.private_key({ "APPLE_PRIVATE_KEY" => "a\\nb" })
  end
end

# The real strategy, with AppleSignIn's options, from the button to the
# callback: Apple's token and keys endpoints are stubbed with our own key.
class AppleSignInRoundTripTest < ActiveSupport::TestCase
  include Rack::Test::Methods

  KEY = OpenSSL::PKey::EC.generate("prime256v1")
  ENV_VARS = {
    "APPLE_CLIENT_ID" => "org.semisto.terranova.signin", "APPLE_TEAM_ID" => "TEAM123456",
    "APPLE_KEY_ID" => "KEY1234567", "APPLE_PRIVATE_KEY" => KEY.to_pem.gsub("\n", "\\n")
  }.freeze

  setup do
    @validation = OmniAuth.config.request_validation_phase
    OmniAuth.config.request_validation_phase = nil
  end

  teardown { OmniAuth.config.request_validation_phase = @validation }

  def app
    args = AppleSignIn.provider_args(ENV_VARS)
    Rack::Builder.new do
      use Rack::Session::Cookie, secret: "x" * 64
      use(OmniAuth::Builder) { provider :apple, *args }
      run ->(env) { [ 200, {}, [ env["omniauth.auth"]&.uid.to_s ] ] }
    end
  end

  test "the button sends to Apple with our return page, and the re-posted answer signs in" do
    post "/auth/apple"
    location = URI(last_response.location)
    assert_equal "appleid.apple.com", location.host
    query = Rack::Utils.parse_query(location.query)
    assert_equal "http://example.org/auth/apple/return", query["redirect_uri"]
    assert_equal "form_post", query["response_mode"]

    jwk = JSON::JWK.new(OpenSSL::PKey::EC.new(KEY.public_to_der))
    id_token = JSON::JWT.new(
      iss: "https://appleid.apple.com", aud: ENV_VARS["APPLE_CLIENT_ID"], sub: "001234.abcd",
      iat: Time.now.to_i, exp: Time.now.to_i + 600, email: "anne@example.org",
      nonce: query["nonce"], nonce_supported: true
    ).tap { |jwt| jwt.kid = "k1" }.sign(KEY, :ES256).to_s
    token = stub_request(:post, "https://appleid.apple.com/auth/token")
      .with(body: hash_including("code" => "c0de", "redirect_uri" => "http://example.org/auth/apple/return"))
      .to_return(headers: { "Content-Type" => "application/json" }, body: { access_token: "a", token_type: "bearer", id_token: }.to_json)
    stub_request(:get, "https://appleid.apple.com/auth/keys")
      .to_return(headers: { "Content-Type" => "application/json" }, body: { keys: [ jwk.normalize.merge(kid: "k1", alg: "ES256", use: "sig") ] }.to_json)

    post "/auth/apple/callback", code: "c0de", state: query["state"], user: { name: { firstName: "Anne" } }.to_json
    assert_requested token
    assert_equal 200, last_response.status
    assert_equal "001234.abcd", last_response.body
  end

  test "an answer that does not carry the session's state is refused" do
    post "/auth/apple"
    post "/auth/apple/callback", code: "c0de", state: "forged"
    assert_includes last_response.location, "/auth/failure?message=csrf_detected"
  end

  test "an answer that arrives without our session cookie is refused" do
    post "/auth/apple"
    clear_cookies
    post "/auth/apple/callback", code: "c0de", state: "forged"
    assert_match %r{\A/auth/failure\?.*strategy=apple}, last_response.location
  end
end
