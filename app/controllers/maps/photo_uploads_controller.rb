# A large video for the « Photos » panel, sent in parts instead of one long
# request: a 450 MB video from a modest connection takes minutes, and the
# proxies in front of the app cut a request long before that. Each part is
# small, goes through PUT /mcp/uploads/:token/parts/:n, and is sent again on
# its own when it fails.
#
#   POST /maps/:map_id/photo_uploads            { file: { filename, byte_size, content_type } }
#     → { upload: { id, partsUrl, partSize, partCount } }
#   POST /maps/:map_id/photo_uploads/:id/complete  { checksum, photo: { caption, lng, lat… } }
#     → 202, the parts are put together in the background (PhotoUploadJob)
#   GET  /maps/:map_id/photo_uploads/:id
#     → { status: "processing" | "done" | "failed", photo?, message? }
module Maps
  class PhotoUploadsController < ApplicationController
    include MapScoped

    CHECKSUM = %r{\A[A-Za-z0-9+/]{22}==\z}
    PHOTO_KEYS = %i[caption taken_at heading photo_album_id map_feature_id soil_sample_id source location_source lng lat bioindicator_status retake_of_id].freeze

    before_action :set_map
    before_action :set_mission, only: :create
    before_action :require_editor!, only: :create, unless: -> { @mission }
    before_action :set_upload, only: %i[show complete]

    def create
      file = params.require(:file).permit(:filename, :byte_size, :content_type)
      byte_size = file[:byte_size].to_i
      refusal = refusal_for(file[:filename].to_s, file[:content_type].to_s, byte_size)
      return render json: { message: refusal }, status: :unprocessable_content if refusal

      upload = McpUpload.transaction do
        blob = ActiveStorage::Blob.create_before_direct_upload!(
          filename: file[:filename], byte_size:, checksum: nil, content_type: file[:content_type], metadata: { composed: true }
        )
        McpUpload.create!(blob:, map: @map, user: Current.user, kind: McpUpload::WEB_PHOTO, part_size: McpUpload.web_photo_part_size,
                          photo_params: { drone_mission_id: @mission&.id }.compact)
      end
      render json: {
        upload: { id: upload.id, partsUrl: mcp_upload_part_path(upload.part_token, 0).delete_suffix("/0"), partSize: upload.part_size, partCount: upload.part_count }
      }, status: :created
    end

    # Every part arrived: records the MD5 the browser read and what was typed,
    # then hands the parts to PhotoUploadJob.
    def complete
      return render json: state unless @upload.attached_at.nil? && @upload.failure.nil? && @upload.blob.checksum.nil?
      checksum = params[:checksum].to_s
      return render json: { message: t("soil_photos.errors.checksum_mismatch") }, status: :unprocessable_content unless checksum.match?(CHECKSUM)
      missing = @upload.missing_parts
      return render json: { message: t("soil_photos.errors.parts_missing"), missing: }, status: :unprocessable_content if missing.any?

      typed = params.fetch(:photo, {}).permit(*PHOTO_KEYS).to_h.compact_blank
      @upload.blob.update!(checksum:)
      @upload.update!(photo_params: (@upload.photo_params || {}).merge(typed))
      PhotoUploadJob.perform_later(@upload)
      render json: state, status: :accepted
    end

    def show
      render json: state
    end

    private
      def set_mission
        return if params[:drone_mission_id].blank?
        @mission = @map.drone_missions.find_by(id: params[:drone_mission_id])
        head :not_found unless @mission&.deliverable_by?(Current.user)
      end

      # Only whoever sent it follows an upload.
      def set_upload
        @upload = McpUpload.find_by(id: params[:id], map: @map, user: Current.user, kind: McpUpload::WEB_PHOTO)
        render json: { message: t("soil_photos.errors.upload_expired") }, status: :not_found unless @upload
      end

      def state
        if @upload.map_photo
          { status: "done", photo: @upload.map_photo.as_inertia }
        elsif @upload.failure
          { status: "failed", message: @upload.failure }
        else
          { status: "processing" }
        end
      end

      # The same rules as MapPhoto, said before a byte travels. Only videos
      # travel in parts (a HEIC photo is converted from the request itself).
      def refusal_for(filename, content_type, byte_size)
        unless MapPhoto::VIDEO_TYPES.include?(content_type)
          return t("soil_photos.errors.not_a_media", name: filename, types: t("soil_photos.errors.media_types_label"))
        end
        return t("soil_photos.errors.image_missing") unless byte_size.positive?
        if byte_size > MapPhoto::VIDEO_MAX_BYTES
          return t("soil_photos.errors.video_too_large", name: filename, size: MapPhoto.megabytes(byte_size), max: MapPhoto.megabytes(MapPhoto::VIDEO_MAX_BYTES))
        end
        return if @mission || !Billing.enabled?
        usage = StorageUsage.for_map(@map)
        StorageUsage.full_message(usage) unless usage.allows?(byte_size)
      end
  end
end
