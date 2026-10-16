# /logos/:key — a team's or a pro account's logo (HasLogo#logo_url), sized for
# print. The key is the blob's signed id, so it opens without a session, like
# an avatar: a document's print page and its PDF show it.
class LogosController < ApplicationController
  include ActiveStorage::SetCurrent
  allow_unauthenticated_access
  LINK_LIFETIME = 1.hour

  def show
    blob = ActiveStorage::Blob.find_signed(params[:key])
    attachment = blob && ActiveStorage::Attachment.find_by(blob:, record_type: %w[User Organization], name: "logo")
    return head :not_found unless attachment

    target = begin
      attachment.variant(:print).processed
    rescue StandardError => error
      Rails.logger.warn("[logos] no print size for #{attachment.record_type} #{attachment.record_id}: #{error.class}: #{error.message}")
      attachment
    end
    expires_in LINK_LIFETIME - 1.minute, public: true
    redirect_to stored_file_url(target, expires_in: LINK_LIFETIME), allow_other_host: true
  end
end
