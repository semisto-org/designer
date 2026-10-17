# Drone views imported from a file by anyone editing the map (« Couches »
# panel). JSON for the editor:
#
#   POST   /maps/:map_id/aerial_views              announces the file (name,
#          size) and gets where to send its parts (McpUpload, kind aerial_view)
#   POST   /maps/:map_id/aerial_views/:id/complete  once every part is sent,
#          with the file's MD5: the conversion starts (AerialViewImportJob)
#   GET    /maps/:map_id/aerial_views              the imports, to follow them
#   DELETE /maps/:map_id/aerial_views/:id          removes an imported view
#
# and, for everyone who sees the map, `archive`: a short-lived link to the
# view's PMTiles archive. Views staff set up by their address stay on
# /admin/drone-views.
module Maps
  class AerialViewsController < ApplicationController
    include MapScoped
    include ActiveStorage::SetCurrent

    before_action :set_map
    before_action :require_editor!, except: :archive
    before_action :set_view, only: %i[complete destroy archive]
    before_action :require_import!, only: %i[complete destroy]

    LINK_LIFETIME = 10.minutes
    CHECKSUM = %r{\A[A-Za-z0-9+/]{22}==\z}

    def index
      render json: { aerialViews: list }
    end

    def create
      file = file_params
      refusal = refusal(file)
      return render json: { message: refusal }, status: :unprocessable_content if refusal

      view = nil
      upload = nil
      AerialView.transaction do
        blob = ActiveStorage::Blob.create_before_direct_upload!(
          filename: file[:filename], byte_size: file[:byte_size], checksum: nil,
          content_type: "application/octet-stream", metadata: { composed: true }
        )
        upload = McpUpload.create!(blob:, map: @map, user: Current.user, kind: McpUpload::AERIAL_VIEW, part_size: McpUpload.part_size_for_new)
        view = @map.aerial_views.new(view_params.merge(
          kind: "pmtiles", status: "uploading", created_by: Current.user, source_upload: upload,
          attribution: t("drone.attribution_imported", name: Current.user.display_name),
          source_filename: file[:filename], source_byte_size: file[:byte_size]
        ))
        view.save!
      end
      render json: {
        aerialView: json(view),
        upload: { partsUrl: mcp_upload_part_path(upload.part_token, 0).delete_suffix("/0"), partSize: upload.part_size, partCount: upload.part_count }
      }, status: :created
    rescue ActiveRecord::RecordInvalid => error
      render json: { message: error.record.errors.full_messages.to_sentence, errors: error.record.errors }, status: :unprocessable_content
    end

    # Every part arrived: records the MD5 the browser read and hands the file to the conversion.
    def complete
      return render json: { aerialView: json(@view) } unless @view.status == "uploading"
      upload = @view.source_upload
      checksum = params[:checksum].to_s
      return render json: { message: t("drone.import.errors.checksum") }, status: :unprocessable_content unless checksum.match?(CHECKSUM)
      return render json: { message: t("drone.import.errors.expired") }, status: :unprocessable_content unless upload
      missing = upload.missing_parts
      return render json: { message: t("drone.import.errors.missing_parts"), missing: }, status: :unprocessable_content if missing.any?

      upload.blob.update!(checksum:)
      upload.update!(attached_at: Time.current)
      @view.update!(status: "processing")
      AerialViewImportJob.perform_later(@view)
      render json: { aerialView: json(@view) }
    end

    # Not while the conversion runs: it would write to a view that is gone.
    def destroy
      return render json: { message: t("drone.import.errors.busy") }, status: :conflict if @view.status == "processing"
      upload = @view.source_upload
      @view.destroy!
      upload&.discard!
      render json: { aerialViews: list }
    end

    def archive
      return head :not_found unless @view.ready? && @view.archive.attached?
      expires_in LINK_LIFETIME - 1.minute, private: true
      redirect_to stored_file_url(@view.archive, expires_in: LINK_LIFETIME), allow_other_host: true
    end

    private
      def set_view
        @view = @map.aerial_views.find(params[:id])
      end

      # Only views imported on the map: the ones Semisto set up stay with staff.
      def require_import!
        head :not_found unless @view.imported?
      end

      def list = @map.aerial_views.imported.includes(:created_by).map { json(_1) }

      def json(view) = view.as_inertia(archive_url: archive_map_aerial_view_path(@map, view))

      def view_params
        params.require(:aerial_view).permit(:name, :captured_on)
      end

      def file_params
        file = params.require(:file).permit(:filename, :byte_size)
        { filename: file[:filename].to_s.strip.first(255), byte_size: file[:byte_size].to_i }
      end

      def refusal(file)
        return t("drone.import.errors.no_file") if file[:filename].blank? || file[:byte_size] <= 0
        return t("drone.import.errors.format") unless AerialView::UPLOAD_EXTENSIONS.include?(File.extname(file[:filename]).downcase)
        t("drone.import.errors.too_large", max: AerialView::MAX_UPLOAD_BYTES / 1.gigabyte) if file[:byte_size] > AerialView::MAX_UPLOAD_BYTES
      end
  end
end
