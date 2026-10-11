# Serves a map document's file (Maps::DocumentsController and the project
# sheet's private link): the app checks access first, then redirects to a
# short-lived storage link. Only images and PDFs are shown in the browser;
# everything else is downloaded (Active Storage also forces it).
module ServesMapDocuments
  extend ActiveSupport::Concern

  DOCUMENT_SIZES = %w[thumb large original download].freeze
  DOCUMENT_LINK_LIFETIME = 5.minutes

  included do
    include ActiveStorage::SetCurrent
  end

  private
    def serve_document(document)
      size = params[:size].presence_in(DOCUMENT_SIZES) || "original"
      target, disposition = document.served(size)
      return head :not_found unless target
      expires_in DOCUMENT_LINK_LIFETIME - 1.minute, private: true
      redirect_to target.url(expires_in: DOCUMENT_LINK_LIFETIME, disposition:), allow_other_host: true
    rescue ActiveStorage::Error, Vips::Error, ImageProcessing::Error => error
      # An image libvips cannot read still has its original.
      Rails.logger.warn("[documents] no #{size} for document #{document.id}: #{error.class}: #{error.message}")
      return head :not_found if size == "thumb"
      redirect_to document.file.url(expires_in: DOCUMENT_LINK_LIFETIME, disposition: :attachment), allow_other_host: true
    end

    def document_limits
      { maxBytes: MapDocument::MAX_BYTES, extensions: MapDocument::EXTENSIONS }
    end

    def document_params(permitted = %i[file thumbnail title description])
      raw = params.require(:document).permit(*permitted, tags: [])
      # FormData sends an empty tag list as nothing at all.
      raw[:tags] = [] if params[:document].key?(:tags) && raw[:tags].nil?
      raw
    end

    def render_document_errors(document)
      render json: { message: document.errors.full_messages.to_sentence, errors: document.errors.to_hash(true) }, status: :unprocessable_entity
    end
end
