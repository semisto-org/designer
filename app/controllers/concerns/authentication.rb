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

    # Signing in while another account is signed in on this browser keeps
    # that account one click away (« Changer de compte »): its session joins
    # the other accounts' list.
    def start_new_session_for(user)
      previous = Session.find_by(id: cookies.signed[:session_id], impersonator_id: nil) if cookies.signed[:session_id]
      user.sessions.create!(user_agent: request.user_agent, ip_address: request.remote_ip).tap do |session|
        Current.session = session
        cookies.signed.permanent[:session_id] = { value: session.id, httponly: true, same_site: :lax }
        others = other_sessions.reject { |s| s.user_id == user.id }
        others.unshift(previous) if previous && previous.user_id != user.id && others.none? { |s| s.user_id == previous.user_id }
        store_other_sessions(others)
      end
    end

    # Signs out the current account only. Returns the account signed in on
    # this browser that takes over, if any.
    def terminate_session
      # Signing out while impersonating signs the admin out too.
      Current.session = end_impersonation(Current.session, reason: "sign_out") if Current.session.impersonation?
      Current.session&.destroy
      cookies.delete(:session_id)
      Current.session = nil
      next_session = other_sessions.first
      switch_to_session(next_session) if next_session
      next_session&.user
    end

    MAX_OTHER_SESSIONS = 4
    OTHER_SESSIONS_COOKIE = :other_session_ids

    # The other accounts signed in on this browser (never an impersonation,
    # never the current account), most recent first.
    def other_sessions
      ids = Array(cookies.signed[OTHER_SESSIONS_COOKIE]).map(&:to_i).first(MAX_OTHER_SESSIONS)
      return [] if ids.empty?
      current_user_id = Current.session&.user_id
      found = Session.where(id: ids, impersonator_id: nil).includes(:user).index_by(&:id)
      ids.filter_map { |id| found[id] }.reject { |s| s.user_id == current_user_id }
    end

    # Makes `target` (one of other_sessions) the current account; the account
    # that was current joins the list.
    def switch_to_session(target)
      others = other_sessions.reject { |s| s.id == target.id }
      others.unshift(Current.session) if Current.session && !Current.session.impersonation? && Current.session.persisted?
      cookies.signed.permanent[:session_id] = { value: target.id, httponly: true, same_site: :lax }
      Current.session = target
      store_other_sessions(others.reject { |s| s.user_id == target.user_id })
    end

    def store_other_sessions(sessions)
      ids = sessions.map(&:id).uniq.first(MAX_OTHER_SESSIONS)
      if ids.empty?
        cookies.delete(OTHER_SESSIONS_COOKIE)
      else
        cookies.signed.permanent[OTHER_SESSIONS_COOKIE] = { value: ids, httponly: true, same_site: :lax }
      end
    end
end
