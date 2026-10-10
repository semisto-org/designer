# Sign-in: Google, a magic link sent by e-mail (or the six-digit code sent
# with it, for another device), or an optional password.
class SessionsController < ApplicationController
  allow_unauthenticated_access only: %i[ new create code password review ]
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> { redirect_to new_session_path, alert: t("sessions.rate_limited") }
  rate_limit to: 10, within: 3.minutes, only: %i[code password], name: "sign_in_secret", with: -> { redirect_to new_session_path, alert: t("sessions.rate_limited") }
  rate_limit to: 5, within: 10.minutes, only: :review, with: -> { redirect_to new_session_path, alert: t("sessions.rate_limited") }

  def new
    return redirect_to maps_path if authenticated?
    render inertia: "sessions/new", props: { reviewAccess: AppReview.enabled? }
  end

  # Sends a magic link and a code. Unknown addresses get an account on first sign-in.
  def create
    email = params.require(:email_address).to_s.strip.downcase
    user = User.find_or_initialize_by(email_address: email)
    if user.save
      code = user.issue_sign_in_code!
      MagicLinkMailer.sign_in(user, code:, return_to: session[:return_to_after_authenticating]).deliver_later
      redirect_to new_session_path(sent: email), notice: t("sessions.link_sent", email:)
    else
      redirect_to new_session_path, alert: t("sessions.invalid_email")
    end
  end

  # The code from the e-mail, typed on the device that asked for it.
  def code
    email = params[:email_address].to_s.strip.downcase
    user = User.find_by(email_address: email)
    if user&.sign_in_code_matches?(params[:code])
      sign_in user
    else
      redirect_to new_session_path(sent: email), alert: t("sessions.code_invalid")
    end
  end

  def password
    user = User.authenticate_by(email_address: params[:email_address].to_s.strip.downcase, password: params[:password].to_s)
    if user
      sign_in user
    else
      redirect_to new_session_path(password: 1), alert: t("sessions.password_invalid")
    end
  end

  # The app stores' reviewers: one account, signed in with the code given
  # to them in the review notes (AppReview).
  def review
    if AppReview.match?(params[:email_address], params[:code])
      sign_in AppReview.user
    else
      redirect_to new_session_path, alert: t("app_review.invalid")
    end
  end

  def destroy
    terminate_session
    redirect_to root_path, status: :see_other
  end

  private
    def sign_in(user)
      user.signed_in!
      start_new_session_for user
      redirect_to after_authentication_url, notice: t("sessions.signed_in")
    end
end
