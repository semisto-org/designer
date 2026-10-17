# Turns the file someone sent as a drone view (AerialView#source_upload,
# in parts) into the view's PMTiles archive: reads the parts back to a
# working folder, checks them against the MD5 the browser gave, converts
# (Tiler), stores the archive with the map's files, then lets go of the
# parts. A view Semisto set up as an XYZ address is copied the same way, its
# tiles fetched from that address (XyzCopy) instead of read from parts. The
# person who imported it gets an e-mail when it is on the map.
#
# The working folder holds the file, its tiles and the archive at once,
# about three times the file's size: AERIAL_WORK_DIR puts it on a volume
# with room (default tmp/aerial).
module AerialViews
  class Import
    def self.work_root
      Pathname(ENV.fetch("AERIAL_WORK_DIR", Rails.root.join("tmp/aerial").to_s)).tap(&:mkpath)
    end

    def initialize(view)
      @view = view
    end

    def call
      upload = @view.source_upload
      copy = upload.nil? && @view.url.present?
      return @view.fail!("upload_incomplete") unless upload || copy
      @view.update!(status: "processing", failure: nil)
      Dir.mktmpdir("view-#{@view.id}-", self.class.work_root) do |dir|
        source = copy ? XyzCopy.new(@view, dir).call : upload.download_parts_to(File.join(dir, "source#{File.extname(@view.source_filename.to_s).downcase}"))
        archive = Tiler.new(source, dir).call
        store(archive) if @view.reload
      end
      upload&.discard!
      DroneMailer.import_ready(@view).deliver_later if @view.created_by
      @view
    rescue McpUpload::Incomplete
      @view.fail!("upload_incomplete")
    rescue Tiler::Failure => failure
      Rails.logger.info("[aerial_views] view #{@view.id} not imported: #{failure.message}")
      @view.fail!(failure.code)
    end

    private
      def store(path)
        header = PmtilesHeader.read(path)
        File.open(path, "rb") do |file|
          @view.archive.attach(io: file, filename: "vue-drone-#{@view.captured_on.iso8601}.pmtiles",
            content_type: "application/vnd.pmtiles", identify: false)
        end
        @view.update!(status: "ready", failure: nil, kind: "pmtiles", min_zoom: header.min_zoom,
          max_zoom: header.max_zoom.clamp(0, AerialView::MAX_ZOOM), bounds: header.bounds)
      end
  end
end
