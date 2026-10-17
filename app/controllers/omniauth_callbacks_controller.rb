class OmniauthCallbacksController < ApplicationController
  allow_unauthenticated_access
  # Re-posted by Auth::AppleReturnsController without a CSRF token; OmniAuth
  # has already matched the state it kept in the session.
  skip_forgery_protection only: :apple

  def google
    sign_in_with User.from_google(request.env["omniauth.auth"])
  end

  def apple
    sign_in_with User.from_apple(request.env["omniauth.auth"])
  end

  def failure
    redirect_to new_session_path, alert: t(params[:strategy] == "apple" ? "sessions.apple_failed" : "sessions.google_failed")
  end

  private
    def sign_in_with(user)
      user.signed_in!
      start_new_session_for user
      redirect_to after_authentication_url, notice: t("sessions.signed_in")
    end
end
