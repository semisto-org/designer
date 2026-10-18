module Imports
  module Immich
    # Brings the photos of one Immich album into a Designer map, once: each
    # image becomes a MapPhoto (`source: "import"`) placed from its EXIF
    # position, dated from its EXIF date, captioned with its Immich
    # description, and filed in a photo album of the map named after the
    # Immich album. Videos (MP4, MOV, WebM up to MapPhoto::VIDEO_MAX_BYTES)
    # come as their original file, streamed to disk; other videos are counted
    # and left out.
    #
    # Re-runnable: every imported asset is noted in the ImportRecord ledger
    # (source "immich"), and a file already on the map (same checksum) is not
    # added twice. Photos deleted in Designer afterwards are not brought back.
    #
    # JPEG, PNG, WebP and HEIC come as originals (MapPhoto turns HEIC into
    # JPEG, EXIF kept). Other types (RAW…) and files heavier than
    # MapPhoto::MAX_BYTES come as Immich's own JPEG rendition (full size when
    # the server generates it, else the preview): position and date still
    # come from the asset's EXIF.
    #
    # Only project albums are imported: their name starts with PROJECT_MARK
    # (« 📍 Les Griants »). Other albums (trainings, events…) are refused
    # unless `force`. The mark is dropped from the map's album name.
    #
    # `dry_run` reads Immich and counts, without downloading or writing.
    #
    # `pause` is called after each photo added: the rake task uses it to let
    # the background jobs each photo enqueues (thumbnails, large variant)
    # catch up, so the import and those jobs never hold dozens of decoded
    # images in memory at once on a small server.
    class Importer
      SOURCE = "immich".freeze
      OUTCOMES = %i[created planned known duplicate video failed].freeze
      # Located assets looked at to guess which map an album belongs to.
      SUGGESTION_SAMPLE = 50
      PROJECT_MARK = "📍".freeze
      EXTENSIONS = {
        "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp", "image/heic" => "heic", "image/heif" => "heif",
        "video/mp4" => "mp4", "video/quicktime" => "mov", "video/webm" => "webm"
      }.freeze
      # Originals the map takes as they are (HEIC is converted on save).
      ORIGINAL_TYPES = (MapPhoto::CONTENT_TYPES + HeicImage::TYPES).freeze

      Result = Data.define(:album_name, :map, :counts, :located, :warnings, :dry_run)

      attr_reader :map, :client, :album_id

      def initialize(map:, client:, album_id:, album_name: nil, dry_run: false, force: false, pause: nil)
        @map = map
        @pause = pause
        @client = client
        @album_id = album_id
        @album_name = album_name
        @dry_run = dry_run
        @force = force
        @counts = OUTCOMES.index_with { 0 }
        @located = 0
        @warnings = []
      end

      def dry_run? = @dry_run

      def call
        immich_album = client.album(album_id)
        immich_name = immich_album["albumName"].to_s
        unless @force || self.class.project_album?(immich_name)
          raise Error.new(:not_a_project_album, name: immich_name, mark: PROJECT_MARK)
        end
        name = (@album_name.presence || self.class.map_album_name(immich_name).presence || album_id).to_s.truncate(80)
        @ledger = ImportRecord.where(map:, source: SOURCE, external_type: "asset").pluck(:external_id).to_set
        client.each_album_asset(album_id) { |asset| import(asset, name) }
        Result.new(album_name: name, map:, counts: @counts, located: @located, warnings: @warnings, dry_run: dry_run?)
      end

      # A project album: its name starts with PROJECT_MARK.
      def self.project_album?(name) = name.to_s.lstrip.start_with?(PROJECT_MARK)

      # « 📍 Les Griants » → « Les Griants ».
      def self.map_album_name(name) = name.to_s.strip.delete_prefix(PROJECT_MARK).strip

      # The maps whose outline holds the album's located photos, with how many
      # of the sampled photos fall in each, most first.
      def self.suggest_maps(assets)
        points = assets.filter_map { |asset| position(asset) }.first(SUGGESTION_SAMPLE)
        tally = Hash.new(0)
        points.each do |lng, lat|
          Map.where("ST_Contains(boundary, ST_SetSRID(ST_MakePoint(?, ?), 4326))", lng, lat).pluck(:id).each { |id| tally[id] += 1 }
        end
        maps = Map.where(id: tally.keys).index_by(&:id)
        tally.sort_by { |id, count| [ -count, id ] }.map { |id, count| [ maps[id], count ] }
      end

      # [lng, lat] from the asset's EXIF, or nil.
      def self.position(asset)
        exif = asset["exifInfo"] || {}
        lat = Float(exif["latitude"], exception: false)
        lng = Float(exif["longitude"], exception: false)
        return nil if lat.nil? || lng.nil? || (lat.zero? && lng.zero?)
        return nil unless lat.between?(-90, 90) && lng.between?(-180, 180)
        [ lng, lat ]
      end

      private
        def import(asset, album_name)
          return count(:video) unless asset["type"] == "IMAGE" || video?(asset)
          return count(:known) if @ledger.include?(asset["id"].to_s)
          return count(:planned) if dry_run?

          photo = new_photo(asset, album_name)
          if video?(asset)
            video = client.original_file(asset["id"], max_bytes: MapPhoto::VIDEO_MAX_BYTES)
            type = Marcel::MimeType.for(video.file, declared_type: video.content_type.presence || asset["originalMimeType"])
            video.file.rewind
            photo.image.attach(io: video.file, filename: stored_name(asset, type), content_type: type)
          else
            file = fetch(asset)
            photo.image.attach(io: StringIO.new(file.body), filename: filename(asset, file), content_type: sniff(file))
          end
          if photo.save
            record!(asset, photo)
            count(:created)
            @pause&.call
          elsif photo.errors.of_kind?(:base, :already_imported)
            record!(asset, nil)
            count(:duplicate)
          else
            failed(asset, photo.errors.full_messages.to_sentence)
          end
        rescue Error => error
          failed(asset, error.message)
        ensure
          video&.file&.close!
        end

        # A video the map takes: a known type, not heavier than the limit.
        def video?(asset)
          asset["type"] == "VIDEO" && MapPhoto::VIDEO_TYPES.include?(asset["originalMimeType"].to_s) &&
            asset.dig("exifInfo", "fileSizeInByte").to_i <= MapPhoto::VIDEO_MAX_BYTES
        end

        # The original when the map takes it as it is, else a JPEG rendition.
        def fetch(asset)
          declared = asset["originalMimeType"].to_s
          size = asset.dig("exifInfo", "fileSizeInByte").to_i
          if ORIGINAL_TYPES.include?(declared) && size <= MapPhoto::MAX_BYTES
            file = client.original(asset["id"], max_bytes: MapPhoto::MAX_BYTES)
            return file if ORIGINAL_TYPES.include?(sniff(file))
          end
          begin
            client.rendition(asset["id"], size: "fullsize", max_bytes: MapPhoto::MAX_BYTES)
          rescue Client::NotFound
            client.rendition(asset["id"], size: "preview", max_bytes: MapPhoto::MAX_BYTES)
          end
        end

        def sniff(file) = Marcel::MimeType.for(StringIO.new(file.body), declared_type: file.content_type.presence)

        def new_photo(asset, album_name)
          position = self.class.position(asset)
          @located += 1 if position
          map.photos.new(
            source: "import", skip_storage_quota: true, album: photo_album(album_name), caption: asset.dig("exifInfo", "description").to_s.strip.truncate(500).presence,
            taken_at: taken_at(asset), location: position,
            location_source: position ? "exif" : nil
          )
        end

        def taken_at(asset)
          value = asset.dig("exifInfo", "dateTimeOriginal").presence || asset["fileCreatedAt"].presence
          value && Time.zone.parse(value.to_s)
        rescue ArgumentError
          nil
        end

        # The original name, with the extension of what was actually stored.
        def filename(asset, file) = stored_name(asset, sniff(file))

        def stored_name(asset, type)
          base = File.basename(asset["originalFileName"].presence || asset["id"].to_s, ".*")
          "#{base}.#{EXTENSIONS.fetch(type, "jpg")}"
        end

        def photo_album(name)
          @photo_album ||= map.photo_albums.find_by(name:) ||
            map.photo_albums.create!(name:, position: map.photo_albums.maximum(:position).to_i + 1)
        end

        def record!(asset, photo)
          ImportRecord.create!(map:, source: SOURCE, external_type: "asset", external_id: asset["id"].to_s, record: photo, imported_at: Time.current)
          @ledger << asset["id"].to_s
        end

        def count(outcome) = @counts[outcome] += 1

        def failed(asset, message)
          count(:failed)
          @warnings << "#{asset["originalFileName"].presence || asset["id"]} : #{message}"
        end
    end
  end
end
