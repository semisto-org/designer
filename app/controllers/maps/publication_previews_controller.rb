module Maps
  # The owner's browser sends the link preview it painted after publishing
  # (collab/preview.ts): a PNG of the garden in year 15, which replaces the
  # site's generic image when the public address is shared.
  class PublicationPreviewsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_owner!

    def create
      publication = @map.publication
      return head :not_found unless publication&.live?
      file = params[:image]
      unless png?(file)
        return render json: { message: t("collab.publish.preview_invalid") }, status: :unprocessable_entity
      end
      publication.preview_image.attach(io: file, filename: "preview-#{publication.version}.png", content_type: "image/png")
      render json: { previewPath: publication.preview_path }
    end

    private
      PNG_SIGNATURE = "\x89PNG\r\n\x1A\n".b

      def png?(file)
        return false unless file.respond_to?(:read) && file.size.between?(1, MapPublication::PREVIEW_MAX_BYTES)
        signature = file.read(8)
        file.rewind
        signature == PNG_SIGNATURE
      end
  end
end
