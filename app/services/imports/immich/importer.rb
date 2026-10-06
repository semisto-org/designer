module Imports
  module Immich
    # Brings the photos of one Immich album into a Designer map, once: each
    # image becomes a MapPhoto (`source: "import"`) placed from its EXIF
    # position, dated from its EXIF date, captioned with its Immich
    # description, and filed in a photo album of the map named after the
    # Immich album. Videos are left out (images only in v1).
    #
    # Re-runnable: every imported asset is noted in the ImportRecord ledger
    # (source "immich"), and a file already on the map (same checksum) is not
    # added twice. Photos deleted in Designer afterwards are not brought back.
    #
    # Files in a type the map does not take (HEIC, RAW…) or heavier than
    # MapPhoto::MAX_BYTES come as Immich's own JPEG rendition (full size when
    # the server generates it, else the preview): position and date still
    # come from the asset's EXIF.
    #
    # `dry_run` reads Immich and counts, without downloading or writing.
    class Importer
      SOURCE = "immich".freeze
      OUTCOMES = %i[created planned known duplicate video failed].freeze
      # Located assets looked at to guess which map an album belongs to.
      SUGGESTION_SAMPLE = 50
      EXTENSIONS = { "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp" }.freeze

      Result = Data.define(:album_name, :map, :counts, :located, :warnings, :dry_run)

      attr_reader :map, :client, :album_id

      def initialize(map:, client:, album_id:, album_name: nil, dry_run: false)
        @map = map
        @client = client
        @album_id = album_id
        @album_name = album_name
        @dry_run = dry_run
        @counts = OUTCOMES.index_with { 0 }
        @located = 0
        @warnings = []
      end

      def dry_run? = @dry_run

      def call
        immich_album = client.album(album_id)
        name = (@album_name.presence || immich_album["albumName"].presence || album_id).to_s.truncate(80)
        @ledger = ImportRecord.where(map:, source: SOURCE, external_type: "asset").pluck(:external_id).to_set
        client.each_album_asset(album_id) { |asset| import(asset, name) }
        Result.new(album_name: name, map:, counts: @counts, located: @located, warnings: @warnings, dry_run: dry_run?)
      end

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
          return count(:video) unless asset["type"] == "IMAGE"
          return count(:known) if @ledger.include?(asset["id"].to_s)
          return count(:planned) if dry_run?

          file = fetch(asset)
          photo = new_photo(asset, album_name)
          photo.image.attach(io: StringIO.new(file.body), filename: filename(asset, file), content_type: sniff(file))
          if photo.save
            record!(asset, photo)
            count(:created)
          elsif photo.errors.of_kind?(:base, :already_imported)
            record!(asset, nil)
            count(:duplicate)
          else
            failed(asset, photo.errors.full_messages.to_sentence)
          end
        rescue Error => error
          failed(asset, error.message)
        end

        # The original when the map takes it as it is, else a JPEG rendition.
        def fetch(asset)
          declared = asset["originalMimeType"].to_s
          size = asset.dig("exifInfo", "fileSizeInByte").to_i
          if MapPhoto::CONTENT_TYPES.include?(declared) && size <= MapPhoto::MAX_BYTES
            file = client.original(asset["id"], max_bytes: MapPhoto::MAX_BYTES)
            return file if MapPhoto::CONTENT_TYPES.include?(sniff(file))
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
            source: "import", album: photo_album(album_name), caption: asset.dig("exifInfo", "description").to_s.strip.truncate(500).presence,
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
        def filename(asset, file)
          base = File.basename(asset["originalFileName"].presence || asset["id"].to_s, ".*")
          "#{base}.#{EXTENSIONS.fetch(sniff(file), "jpg")}"
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
