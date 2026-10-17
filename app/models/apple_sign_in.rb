# Sign in with Apple, on the web and, through the system browser, in the
# phone app. Needs the Services ID (APPLE_CLIENT_ID), the team id, and a
# Sign in with Apple key (APPLE_KEY_ID + its .p8 content in APPLE_PRIVATE_KEY).
# The return URL to register on the Services ID is
# https://<host>/auth/apple/return (see Auth::AppleReturnsController).
module AppleSignIn
  VARIABLES = %w[APPLE_CLIENT_ID APPLE_TEAM_ID APPLE_KEY_ID APPLE_PRIVATE_KEY].freeze
  RETURN_PATH = "/auth/apple/return".freeze

  def self.enabled?
    VARIABLES.all? { |name| ENV[name].present? }
  end

  # Arguments for OmniAuth's `provider :apple` (config/initializers/omniauth.rb).
  def self.provider_args(env = ENV)
    [ env["APPLE_CLIENT_ID"], "", {
      team_id: env["APPLE_TEAM_ID"], key_id: env["APPLE_KEY_ID"], pem: private_key(env),
      # Apple posts back from its own site, so the browser leaves out our
      # session cookie (SameSite=Lax) and OmniAuth could not check its state.
      # The return page re-posts the answer from our origin, cookie included.
      setup: ->(rack_env) { rack_env["omniauth.strategy"].options[:redirect_uri] = Rack::Request.new(rack_env).base_url + RETURN_PATH }
    } ]
  end

  # The .p8 key, whether pasted with real line breaks or with « \n ».
  def self.private_key(env = ENV)
    env["APPLE_PRIVATE_KEY"].to_s.gsub("\\n", "\n")
  end
end
