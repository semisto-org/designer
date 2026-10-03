# Sign in with Google. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; the
# authorized redirect URI is https://<host>/auth/google_oauth2/callback.
Rails.application.config.middleware.use OmniAuth::Builder do
  if GoogleSignIn.enabled?
    provider :google_oauth2, ENV["GOOGLE_CLIENT_ID"], ENV["GOOGLE_CLIENT_SECRET"],
      scope: "email,profile", prompt: "select_account"
  end
end
OmniAuth.config.allowed_request_methods = %i[post]
OmniAuth.config.logger = Rails.logger
