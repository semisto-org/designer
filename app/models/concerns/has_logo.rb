# The logo of a team or of a pro account, printed at the top of the map's
# documents (Map#letterhead). Served like an avatar, by the blob's signed id
# (LogosController), so a print page or an export shows it without a session.
module HasLogo
  extend ActiveSupport::Concern

  LOGO_TYPES = %w[image/png image/jpeg image/webp].freeze
  LOGO_MAX_BYTES = 2.megabytes

  included do
    has_one_attached :logo do |attachable|
      attachable.variant :print, resize_to_limit: [ 800, 320 ], format: :png, saver: { strip: true }
    end
    validate :logo_is_acceptable
  end

  def logo_url
    return nil unless logo.attached? && logo.blob.persisted?
    Rails.application.routes.url_helpers.logo_path(logo.blob.signed_id)
  end

  private
    def logo_is_acceptable
      return unless logo.attached?
      blob = logo.blob
      errors.add(:logo, I18n.t("logos.errors.type")) unless LOGO_TYPES.include?(blob.content_type)
      errors.add(:logo, I18n.t("logos.errors.size", max: LOGO_MAX_BYTES / 1.megabyte)) if blob.byte_size > LOGO_MAX_BYTES
    end
end
