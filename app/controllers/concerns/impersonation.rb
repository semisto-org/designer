# « Se connecter en tant que »: an admin opens a session as another user to
# see Designer through their eyes. The admin's own session stays alive (its
# id in a signed cookie) and comes back when the impersonation ends: from
# the banner, after IMPERSONATION_TTL, or on sign out. Every start and end
# lands in AdminEvent. Money and credentials are off limits meanwhile
# (`forbid_while_impersonating`).
module Impersonation
  extend ActiveSupport::Concern

  ADMIN_SESSION_COOKIE = :admin_session_id

  class_methods do
    def forbid_while_impersonating(**options)
      before_action :refuse_while_impersonating, **options
    end
  end

  private
    def impersonating? = Current.session&.impersonation? || false

    def start_impersonation(user)
      admin_session = Current.session
      impersonated = user.sessions.create!(impersonator: admin_session.user, user_agent: request.user_agent, ip_address: request.remote_ip)
      AdminEvent.record!("impersonation_started", admin: admin_session.user, target: user, request:)
      cookies.signed.permanent[ADMIN_SESSION_COOKIE] = { value: admin_session.id, httponly: true, same_site: :lax }
      cookies.signed.permanent[:session_id] = { value: impersonated.id, httponly: true, same_site: :lax }
      Current.session = impersonated
    end

    # Ends the impersonation session `impersonated` and puts the admin's own session back.
    # Returns that session, or nil when it is gone (then nobody is signed in).
    def end_impersonation(impersonated, reason:)
      AdminEvent.record!("impersonation_ended", admin: impersonated.impersonator, target: impersonated.user, request:, reason:)
      impersonated.destroy
      admin_session = Session.find_by(id: cookies.signed[ADMIN_SESSION_COOKIE], user_id: impersonated.impersonator_id, impersonator_id: nil)
      cookies.delete(ADMIN_SESSION_COOKIE)
      if admin_session
        cookies.signed.permanent[:session_id] = { value: admin_session.id, httponly: true, same_site: :lax }
      else
        cookies.delete(:session_id)
      end
      Current.session = admin_session
    end

    def refuse_while_impersonating
      return unless impersonating?
      message = t("admin.impersonation.forbidden")
      if request.format.json? || mobile_app_request?
        render json: { message: }, status: :forbidden
      else
        redirect_back_or_to root_path, alert: message, status: :see_other
      end
    end

    # For the banner shown on every page (shared Inertia prop).
    def impersonation_props
      return nil unless impersonating?
      current = Current.session
      { userName: current.user.display_name, userEmail: current.user.email_address,
        adminName: current.impersonator.display_name, endsAt: current.impersonation_ends_at.iso8601 }
    end
end
