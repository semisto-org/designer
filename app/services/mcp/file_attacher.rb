module Mcp
  # Turns a stored blob (sent by the AI with create_upload and a PUT, or
  # fetched by import_from_url) into a photo or a document of a map, as an
  # upload from the editor would: the real type is read from the file's
  # first bytes, a photo's EXIF block gives its date, place and direction
  # (the AI's values win), a HEIC photo becomes a JPEG, a video (MP4, MOV,
  # WebM) stays as it is.
  class FileAttacher
    HEAD_BYTES = 4096

    # code: a stable name the AI can act on; message: what to tell it.
    class Refused < StandardError
      attr_reader :code

      def initialize(code, message)
        @code = code
        super(message)
      end
    end

    def initialize(map:, user:)
      @map = map
      @user = user
    end

    # The block sets the AI's own fields on the photo, after the EXIF ones.
    def photo(blob, source: "import")
      type = real_type(blob)
      refuse!("unsupported_type", I18n.t("mcp.upload_errors.photo_type", name: blob.filename)) unless MapPhoto::UPLOAD_TYPES.include?(type)
      video = MapPhoto::VIDEO_TYPES.include?(type)
      max = video ? MapPhoto::VIDEO_MAX_BYTES : MapPhoto::MAX_BYTES
      refuse!("too_large", I18n.t("mcp.upload_errors.too_large", name: blob.filename, max: max / 1.megabyte)) if blob.byte_size > max
      # A video's place and date are read after it is saved (PhotoCameraJob),
      # without holding the call while up to a gigabyte is read.
      exif = video ? {} : blob.open { |file| PhotoExif.read(file.path) }
      photo = @map.photos.new(uploaded_by: @user, source:, taken_at: exif[:taken_at], heading: exif[:heading])
      if exif[:location]
        photo.location = MapPhoto.point_from(*exif[:location])
        photo.location_source = "exif"
      end
      if HeicImage.heic?(type)
        # HeicAttachment converts an io being attached, not a stored blob.
        photo.image.attach(io: StringIO.new(blob.download), filename: blob.filename.to_s, content_type: type)
      else
        blob.update!(content_type: type) if blob.content_type != type
        photo.image.attach(blob)
      end
      yield photo if block_given?
      save!(photo)
      blob.purge_later if HeicImage.heic?(type)
      photo
    end

    # `fields`: title, description, tags (string keys).
    def document(blob, fields = {})
      check_document_type!(blob)
      document = @map.documents.new(
        uploaded_by: @user, origin: "library",
        title: fields["title"], description: fields["description"], tags: Array(fields["tags"])
      )
      document.file.attach(blob)
      save!(document)
      document
    end

    private
      def save!(record)
        record.save!
      rescue ActiveRecord::RecordInvalid
        duplicate = record.errors.of_kind?(:base, :already_imported)
        refuse!(duplicate ? "duplicate" : "invalid", record.errors.full_messages.to_sentence)
      rescue ActiveRecord::RecordNotUnique
        refuse!("duplicate", I18n.t("mcp.upload_errors.duplicate", name: record.try(:image)&.filename || ""))
      end

      # What the first bytes say, refined by the file name for the formats
      # whose bytes are a zip or plain text (docx, kml, csv…).
      def real_type(blob)
        head = blob.service.download_chunk(blob.key, 0...[ HEAD_BYTES, blob.byte_size ].min)
        Marcel::MimeType.for(StringIO.new(head), name: blob.filename.to_s)
      end

      # The library takes any file; one named as a PDF or an image must also
      # be one by its bytes.
      def check_document_type!(blob)
        ext = File.extname(blob.filename.to_s).delete(".").downcase
        refuse!("too_large", I18n.t("mcp.upload_errors.too_large", name: blob.filename, max: MapDocument::MAX_BYTES / 1.megabyte)) if blob.byte_size > MapDocument::MAX_BYTES
        type = real_type(blob)
        expected = MapDocument::KINDS.find { |_, exts| exts.include?(ext) }&.first
        mismatch = (expected == "pdf" && type != "application/pdf") || (expected == "image" && !type.start_with?("image/"))
        refuse!("type_mismatch", I18n.t("mcp.upload_errors.type_mismatch", name: blob.filename, type:)) if mismatch
        blob.update!(content_type: type) if blob.content_type != type && type != "application/octet-stream"
      end

      def refuse!(code, message) = raise(Refused.new(code, message))
  end
end
