# Passwordless sign-in: Google, or a magic link sent by e-mail.
class SessionsController < ApplicationController
  allow_unauthenticated_access only: %i[ new create ]
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> { redirect_to new_session_path, alert: t("sessions.rate_limited") }

  def new
    return redirect_to maps_path if authenticated?
    render inertia: "sessions/new"
  end

  # Sends a magic link. Unknown addresses get an account on first sign-in.
  def create
    email = params.require(:email_address).to_s.strip.downcase
    user = User.find_or_initialize_by(email_address: email)
    if user.save
      MagicLinkMailer.sign_in(user, return_to: session[:return_to_after_authenticating]).deliver_later
      redirect_to new_session_path(sent: email), notice: t("sessions.link_sent", email:)
    else
      redirect_to new_session_path, alert: t("sessions.invalid_email")
    end
  end

  def destroy
    terminate_session
    redirect_to root_path, status: :see_other
  end
end
