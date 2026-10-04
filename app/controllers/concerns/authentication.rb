module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
    helper_method :authenticated?
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
    end
  end

  private
    def authenticated?
      resume_session
    end

    def require_authentication
      resume_session || (mobile_app_request? ? head(:unauthorized) : request_authentication)
    end

    def resume_session
      Current.session ||= session_for_mobile_app || find_session_by_cookie
    end

    # Semisto's own app sends `Authorization: Bearer` with an APP-scoped
    # OAuth token (MobileApp). It acts as a signed-in user, in memory only:
    # no Session row, no cookie.
    def mobile_app_token
      return @mobile_app_token if defined?(@mobile_app_token)
      @mobile_app_token = MobileApp.token_for(request.authorization)
    end

    def mobile_app_request? = request.authorization.to_s.start_with?("Bearer ")

    def session_for_mobile_app
      token = mobile_app_token
      return nil unless token
      token.record_use!
      Session.new(user: token.user, user_agent: request.user_agent, ip_address: request.remote_ip).tap(&:readonly!)
    end

    def find_session_by_cookie
      found = Session.find_by(id: cookies.signed[:session_id]) if cookies.signed[:session_id]
      found&.impersonation_expired? ? end_impersonation(found, reason: "expired") : found
    end

    def request_authentication
      session[:return_to_after_authenticating] = request.url
      redirect_to new_session_path
    end

    def after_authentication_url
      session.delete(:return_to_after_authenticating) || root_url
    end

    def start_new_session_for(user)
      user.sessions.create!(user_agent: request.user_agent, ip_address: request.remote_ip).tap do |session|
        Current.session = session
        cookies.signed.permanent[:session_id] = { value: session.id, httponly: true, same_site: :lax }
      end
    end

    def terminate_session
      # Signing out while impersonating signs the admin out too.
      Current.session = end_impersonation(Current.session, reason: "sign_out") if Current.session.impersonation?
      Current.session&.destroy
      cookies.delete(:session_id)
    end
end
