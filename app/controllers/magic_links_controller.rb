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
    def safe_return_to
      path = params[:return_to].to_s
      path if path.start_with?("/") && !path.start_with?("//")
    end
end
