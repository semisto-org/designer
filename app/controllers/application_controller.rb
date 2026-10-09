class ApplicationController < ActionController::Base
  include Authentication
  include Impersonation

  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  # The phone app (MobileApp) is not a browser: no check for it.
  allow_browser versions: :modern, unless: -> { mobile_app_token }

  # Changes to the importmap will invalidate the etag for HTML responses
  stale_when_importmap_changes if respond_to?(:stale_when_importmap_changes)

  inertia_share do
    {
      currentUser: authenticated? ? Current.user.as_inertia : nil,
      entitlements: authenticated? ? Current.user.entitlements.as_json : nil,
      impersonation: impersonation_props,
      releaseNotes: authenticated? ? release_notes_props : nil,
      env: { googleSignIn: GoogleSignIn.enabled?, billing: Billing.enabled?, plantnet: Providers::PlantNet.configured? }
    }
  end

  private
    # The dot on « Nouveautés » in the main menu, and the latest entry for
    # the note on « Mes cartes ».
    def release_notes_props
      unseen = ReleaseNote.unseen_by(Current.user)
      count = unseen.count
      latest = count.positive? ? unseen.newest_first.first : nil
      { unseen: count, latest: latest && { id: latest.id, title: latest.title } }
    end

    # The phone app authenticates with a bearer token, never a cookie: a
    # forged cross-site request cannot carry it, so no CSRF token is needed.
    def verified_request?
      super || mobile_app_token.present?
    end

    # JSON errors for the map editor's fetch calls.
    def render_errors(record, status: :unprocessable_entity)
      render json: { errors: record.errors.to_hash(true), message: record.errors.full_messages.to_sentence }, status:
    end
end
