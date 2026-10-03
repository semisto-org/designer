class ApplicationController < ActionController::Base
  include Authentication

  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  # Changes to the importmap will invalidate the etag for HTML responses
  stale_when_importmap_changes if respond_to?(:stale_when_importmap_changes)

  inertia_share do
    {
      currentUser: authenticated? ? Current.user.as_inertia : nil,
      entitlements: authenticated? ? Current.user.entitlements.as_json : nil,
      env: { googleSignIn: GoogleSignIn.enabled?, billing: Billing.enabled? }
    }
  end

  private
    # JSON errors for the map editor's fetch calls.
    def render_errors(record, status: :unprocessable_entity)
      render json: { errors: record.errors.to_hash(true), message: record.errors.full_messages.to_sentence }, status:
    end
end
