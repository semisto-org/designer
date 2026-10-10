class OmniauthCallbacksController < ApplicationController
  allow_unauthenticated_access

  def google
    user = User.from_google(request.env["omniauth.auth"])
    user.signed_in!
    start_new_session_for user
    redirect_to after_authentication_url, notice: t("sessions.signed_in")
  end

  def failure
    redirect_to new_session_path, alert: t("sessions.google_failed")
  end
end
