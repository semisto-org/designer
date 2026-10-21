# The files of a drone mission that do not go on the map itself: point
# clouds (LAS/LAZ), 3D models, reports… The pilot sends them in parts, like
# a drone view (McpUpload, kind mission_file); the client and the pilot
# download them.
#
#   POST   /drone_missions/:drone_mission_id/files              announces a file
#   POST   /drone_missions/:drone_mission_id/files/:id/complete with its MD5
#   GET    /drone_missions/:drone_mission_id/files/:id          a short-lived link
#   DELETE /drone_missions/:drone_mission_id/files/:id          the pilot removes it
module DroneMissions
  class FilesController < ApplicationController
    include ActiveStorage::SetCurrent

    MAX_BYTES = 10.gigabytes
    EXTENSIONS = %w[.las .laz .e57 .ply .xyz .obj .mtl .glb .gltf .fbx .zip .pdf .csv .kml .kmz .txt .tif .tiff].freeze
    CHECKSUM = %r{\A[A-Za-z0-9+/]{22}==\z}
    LINK_LIFETIME = 10.minutes

    before_action :set_mission
    before_action :require_pilot!, except: :show

    def create
      file = params.require(:file).permit(:filename, :byte_size)
      filename = file[:filename].to_s.strip.first(255)
      byte_size = file[:byte_size].to_i
      refusal = refusal(filename, byte_size)
      return render json: { message: refusal }, status: :unprocessable_content if refusal

      blob = ActiveStorage::Blob.create_before_direct_upload!(filename:, byte_size:, checksum: nil,
        content_type: Marcel::MimeType.for(name: filename), metadata: { composed: true })
      upload = McpUpload.create!(blob:, map: @mission.map, user: Current.user, kind: McpUpload::MISSION_FILE, part_size: McpUpload.part_size_for_new)
      render json: {
        uploadId: upload.id,
        upload: { partsUrl: mcp_upload_part_path(upload.part_token, 0).delete_suffix("/0"), partSize: upload.part_size, partCount: upload.part_count }
      }, status: :created
    end

    def complete
      upload = McpUpload.find_by(id: params[:id], kind: McpUpload::MISSION_FILE, map: @mission.map, user: Current.user, attached_at: nil)
      return render json: { message: t("drone_missions.files.expired") }, status: :not_found unless upload
      checksum = params[:checksum].to_s
      return render json: { message: t("drone_missions.files.checksum") }, status: :unprocessable_content unless checksum.match?(CHECKSUM)
      missing = upload.missing_parts
      return render json: { message: t("drone_missions.files.missing_parts"), missing: }, status: :unprocessable_content if missing.any?

      upload.blob.update!(checksum:)
      DroneMissionFileJob.perform_later(@mission, upload)
      render json: { message: t("drone_missions.files.processing") }
    end

    def show
      file = @mission.files.find(params[:id])
      redirect_to stored_file_url(file, expires_in: LINK_LIFETIME, disposition: :attachment), allow_other_host: true
    end

    def destroy
      @mission.files.find(params[:id]).purge_later
      head :no_content
    end

    private
      def set_mission
        @mission = DroneMission.find(params[:drone_mission_id])
        head :not_found unless @mission.client?(Current.user) || @mission.pilot_user?(Current.user) || Current.user.admin?
      end

      def require_pilot!
        head :forbidden unless @mission.deliverable_by?(Current.user)
      end

      def refusal(filename, byte_size)
        return t("drone_missions.files.no_file") if filename.blank? || byte_size <= 0
        return t("drone_missions.files.format", formats: EXTENSIONS.join(" ")) unless EXTENSIONS.include?(File.extname(filename).downcase)
        t("drone_missions.files.too_large", max: MAX_BYTES / 1.gigabyte) if byte_size > MAX_BYTES
      end
  end
end
