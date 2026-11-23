# A public link to one file of a map (« Lien public », PubliclyShareable):
# GET /partage/photo/:token and /partage/document/:token, no account, never
# indexed. It opens that file alone, in the browser when it can (images,
# PDF, videos), otherwise as a download, through a short-lived storage link
# handed out on each visit: the address stays good until an editor cuts it.
# A photo goes out as its large variant, without its EXIF block (GPS).
class SharedFilesController < ApplicationController
  include ServesMapDocuments

  allow_unauthenticated_access
  before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }

  LINK_LIFETIME = 5.minutes
  # A video is read in many range requests: its link must outlast the film.
  VIDEO_LINK_LIFETIME = 3.hours

  def photo
    photo = find_shared(MapPhoto) or return gone
    return head :not_found unless photo.image.attached?
    target, lifetime = photo.video? ? [ photo.player_blob, VIDEO_LINK_LIFETIME ] : [ photo.still(:large).processed, LINK_LIFETIME ]
    expires_in LINK_LIFETIME - 1.minute, private: true
    redirect_to stored_file_url(target, expires_in: lifetime), allow_other_host: true
  rescue ActiveStorage::Error, Vips::Error, ImageProcessing::Error => error
    Rails.logger.warn("[shared_files] no image for photo #{photo&.id}: #{error.class}: #{error.message}")
    head :not_found
  end

  # `?download=1` asks for the file to be saved rather than shown.
  def document
    document = find_shared(MapDocument) or return gone
    params[:size] = params[:download].present? ? "download" : "original"
    serve_document(document)
  end

  private
    # The file behind the token. An archived map keeps its links: nothing
    # is taken hostage; a file deleted takes its link with it.
    def find_shared(model)
      token = params[:token].to_s
      return nil if token.length != PubliclyShareable::TOKEN_LENGTH
      model.find_by(share_token: token)
    end

    # A link cut by an editor (or never made): said plainly, in French.
    def gone
      render plain: t("share_link.public.gone"), status: :gone, content_type: "text/plain; charset=utf-8"
    end
end
