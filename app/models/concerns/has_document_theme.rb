# The « charte graphique » of a pro account or a team (DocumentTheme): its
# own fields in document_theme, the one its AI proposed in
# document_theme_draft until someone takes or refuses it, and the image on
# the cover of its documents, served like the logo (LogosController).
module HasDocumentTheme
  extend ActiveSupport::Concern

  COVER_TYPES = %w[image/png image/jpeg image/webp].freeze
  COVER_MAX_BYTES = 8.megabytes

  included do
    has_one_attached :document_cover do |attachable|
      attachable.variant :print, resize_to_limit: [ 2000, 1400 ], format: :jpeg, saver: { strip: true, quality: 85 }
    end
    validate :document_cover_is_acceptable
  end

  def document_theme_object = DocumentTheme.new(self)

  def document_cover_url
    return nil unless document_cover.attached? && document_cover.blob.persisted?
    Rails.application.routes.url_helpers.logo_path(document_cover.blob.signed_id)
  end

  # Takes the AI's proposal: its fields replace the ones it names.
  def accept_document_theme_draft!
    draft = document_theme_draft or return false
    update!(document_theme: DocumentTheme.normalize(document_theme.merge(draft["theme"].to_h)), document_theme_draft: nil)
  end

  private
    def document_cover_is_acceptable
      return unless document_cover.attached?
      blob = document_cover.blob
      errors.add(:document_cover, I18n.t("document_themes.errors.cover_type")) unless COVER_TYPES.include?(blob.content_type)
      errors.add(:document_cover, I18n.t("document_themes.errors.cover_size", max: COVER_MAX_BYTES / 1.megabyte)) if blob.byte_size > COVER_MAX_BYTES
    end
end
