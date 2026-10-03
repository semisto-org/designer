# Development only: sign in as any e-mail without a mail round trip, so
# agents and Playwright scripts can drive the app. Never routed in production.
module Dev
  class LoginsController < ApplicationController
    allow_unauthenticated_access

    def show
      raise ActionController::RoutingError, "Not Found" unless Rails.env.local?
      user = User.find_or_create_by!(email_address: params.fetch(:email, "dev@semisto.org")) do |u|
        u.name = params[:name].presence || "Dev"
      end
      start_new_session_for user
      redirect_to params[:return_to].presence || maps_path
    end
  end
end
