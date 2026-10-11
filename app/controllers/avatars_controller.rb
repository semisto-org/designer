# /avatars/:key — a person's uploaded picture, as a square thumbnail. The key
# is the blob's signed id (User#avatar_url), so it is open like a Google
# picture URL: comments and shared maps show it to whoever sees the person.
class AvatarsController < ApplicationController
  include ActiveStorage::SetCurrent
  allow_unauthenticated_access
  LINK_LIFETIME = 1.hour

  def show
    blob = ActiveStorage::Blob.find_signed(params[:key])
    attachment = blob && ActiveStorage::Attachment.find_by(blob:, record_type: "User", name: "avatar")
    return head :not_found unless attachment

    target = begin
      attachment.variant(:thumb).processed
    rescue StandardError => error
      Rails.logger.warn("[avatars] no thumbnail for user #{attachment.record_id}: #{error.class}: #{error.message}")
      attachment
    end
    expires_in LINK_LIFETIME - 1.minute, public: true
    redirect_to target.url(expires_in: LINK_LIFETIME, disposition: :inline), allow_other_host: true
  end
end
