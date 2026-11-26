# The client deliverable (« Livrable client »): GET /livrable/:token, no
# account needed, never indexed. The plan is the snapshot the team published
# (MapPublication of kind « deliverable »); the documents, photos, videos and
# soil analyses are those the team marks for it, read live
# (Deliverable::Contents). Every file is checked again here (token live, file
# still marked) before a short-lived storage link is handed out.
class DeliverablesController < ApplicationController
  include PublicMeta
  include ServesMapDocuments

  allow_unauthenticated_access
  before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }
  before_action :set_deliverable

  LINK_LIFETIME = 5.minutes
  PHOTO_SIZES = %w[thumb large video].freeze

  def show
    return render(inertia: "deliverables/gone", props: { title: @publication.title }, status: :gone) unless @publication.live?
    count_visit
    render inertia: "deliverables/show", props: @publication.as_public.merge(
      path: @publication.page_path,
      contents: Deliverable::Contents.new(@map, token: @publication.token).as_json,
      madeBy: made_by
    ), meta: meta_tags(title: @publication.title, description: @publication.description.presence || t("deliverables.meta.description"))
  end

  # /livrable/:token/documents/:id/file?size=thumb|large|original|download
  def document
    return head :gone unless @publication.live?
    serve_document(@map.all_documents.in_deliverable.find(params[:id]))
  end

  # /livrable/:token/photos/:id/image?size=thumb|large|video
  # A photo marked for the deliverable, itself: a soil point's mark never
  # sends its photos along. Never the original file: its EXIF block stays
  # with the team.
  def photo
    return head :gone unless @publication.live?
    photo = @map.photos.in_deliverable.find(params[:id])
    return head :not_found unless photo.image.attached?
    size = params[:size].presence_in(PHOTO_SIZES) || "large"
    size = "large" if size == "video" && !photo.video?
    target = size == "video" ? photo.player_blob : photo.still(size.to_sym).processed
    expires_in LINK_LIFETIME - 1.minute, private: true
    redirect_to stored_file_url(target, expires_in: LINK_LIFETIME), allow_other_host: true
  rescue ActiveStorage::Error, Vips::Error, ImageProcessing::Error => error
    Rails.logger.warn("[deliverables] no #{params[:size]} for photo #{params[:id]}: #{error.class}: #{error.message}")
    head :not_found
  end

  # /livrable/:token/soil/:id/reports/:report_id: a lab report (PDF).
  def soil_report
    return head :gone unless @publication.live?
    sample = @map.soil_samples.in_deliverable.find(params[:id])
    report = sample.lab_reports.find(params[:report_id])
    expires_in LINK_LIFETIME - 1.minute, private: true
    redirect_to stored_file_url(report, expires_in: LINK_LIFETIME, disposition: :inline), allow_other_host: true
  end

  private
    def set_deliverable
      @publication = MapPublication.deliverables.includes(:map).find_by!(token: params[:token])
      @map = @publication.map
    end

    # Who made the design: the team's name on a team map, else nobody named.
    def made_by
      @map.organization&.name
    end

    # One visit per browser session, never the map's own people.
    def count_visit
      return if authenticated? && @map.role_for(Current.user)
      seen = Array(session[:seen_publications])
      return if seen.include?(@publication.id)
      session[:seen_publications] = (seen << @publication.id).last(20)
      MapPublication.update_counters(@publication.id, views_count: 1)
    end
end
