module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      set_current_user || reject_unauthorized_connection
    end

    private
      # The website's tabs come with their session cookie; Semisto's phone app
      # with its APP-scoped bearer token (MobileApp), like on the JSON API.
      def set_current_user
        if (token = MobileApp.token_for(request.authorization))
          token.record_use!
          self.current_user = token.user
        elsif (session = Session.find_by(id: cookies.signed[:session_id]))
          self.current_user = session.user
        end
      end

      # The origin check guards cookie connections against other sites; a
      # bearer token cannot be sent by a browser page (no header on a
      # WebSocket), so the phone app needs no origin.
      def allow_request_origin?
        request.authorization.to_s.start_with?("Bearer ") || super
      end
  end
end
