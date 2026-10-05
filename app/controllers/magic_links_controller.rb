class MagicLinksController < ApplicationController
  allow_unauthenticated_access

  def show
    user = User.find_by_token_for(:magic_link, params[:token])
    if user
      user.update!(last_signed_in_at: Time.current)
      start_new_session_for user
      redirect_to safe_return_to || after_authentication_url, notice: t("sessions.signed_in")
    else
      redirect_to new_session_path, alert: t("sessions.link_expired")
    end
  end

  private
    # A path, or a full URL on this host (what sign-in stores, e.g. the phone
    # app's /oauth/authorize request), reduced to its path. Nothing else.
    def safe_return_to
      value = params[:return_to].to_s
      return value if value.start_with?("/") && !value.start_with?("//")

      uri = URI.parse(value)
      uri.request_uri if uri.is_a?(URI::HTTP) && uri.host == request.host
    rescue URI::InvalidURIError
      nil
    end
end
