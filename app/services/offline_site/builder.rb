require "zip"
require "csv"

# Packs a map as a website that opens from a folder, without Terranova and
# without a network (INTENT, « Nothing is taken hostage »). The zip holds:
#
#   index.html            the page to open (any recent browser)
#   LISEZMOI.txt          what is inside and how to open it
#   site/                 the viewer (built from app/frontend/offline by
#                         `npm run build:offline`), the same plan as the
#                         public view: the garden through the years, the
#                         legend, a card per element
#   donnees/carte.js      what the viewer shows, as a script (a page opened
#                         from a folder may run scripts but not fetch files)
#   donnees/tuiles-*.js   the aerial photo and the cadastre around the terrain
#   donnees/carte.geojson every element with its measurements (QGIS…)
#   donnees/plantes.csv   the plant list
#   photos/, documents/   the map's photos and its documents library
#
# The viewer's data is the public view's snapshot (Collab::PublicSnapshot),
# taken with the owner's own choices: every layer, notes and zone names, the
# address; networks only when an owner or editor asks for them. Photo
# originals (EXIF, GPS) and videos go to owners and editors only; viewers
# get the photos as the app shows them.
module OfflineSite
  class Builder
    class ViewerMissing < StandardError; end

    VIEWER_FILES = %w[terranova.js terranova.css].freeze
    TILE_THREADS = 6

    class_attribute :viewer_dir, default: Rails.root.join("public/offline-viewer")
    class_attribute :tile_budget, default: TilePlan::MAX_TILES
    # Photos and documents beyond this are listed in LISEZMOI.txt, not packed.
    class_attribute :max_file_bytes, default: 1.5.gigabytes

    attr_reader :map, :summary

    def initialize(map, user:, include_networks: false, today: Date.current)
      @map = map
      @user = user
      @role = map.role_for(user)
      @include_networks = include_networks && editor?
      @today = today
      @summary = { "photos" => 0, "videos" => 0, "documents" => 0, "tiles" => 0, "skipped" => [] }
      @packed_bytes = 0
    end

    def editor? = %w[owner editor].include?(@role)

    # Writes the zip to `io` (a File or Tempfile).
    def write(io)
      check_viewer!
      Zip::OutputStream.write_buffer(io) do |zip|
        @zip = zip
        VIEWER_FILES.each { |name| add("site/#{name}", File.binread(viewer_dir.join(name))) }
        tiles = pack_tiles
        photos = pack_photos
        documents = pack_documents
        add("donnees/carte.js", script("TERRANOVA_OFFLINE", viewer_data(tiles:, photos:, documents:)))
        add("donnees/carte.geojson", MapGeojsonExport.new(map, include_networks: @include_networks).to_json)
        add("donnees/plantes.csv", plants_csv)
        add("index.html", index_html(tiles))
        add("LISEZMOI.txt", readme)
      end
      io
    end

    def folder = @folder ||= "terranova-#{map.name.to_s.parameterize.first(40).presence || "carte"}"

    private
      def check_viewer!
        missing = VIEWER_FILES.reject { |name| viewer_dir.join(name).file? }
        raise ViewerMissing, "offline viewer not built (npm run build:offline): #{missing.join(", ")}" if missing.any?
      end

      def add(path, data)
        @zip.put_next_entry("#{folder}/#{path}")
        @zip.write(data)
      end

      def add_blob(path, blob)
        @zip.put_next_entry("#{folder}/#{path}")
        blob.download { |chunk| @zip.write(chunk) }
      end

      def fits?(bytes) = @packed_bytes + bytes <= max_file_bytes

      # Lists a file left out for its size; returns nil, for filter_map.
      def skip(label, bytes)
        @summary["skipped"] << { "name" => label, "bytes" => bytes }
        nil
      end

      # A script setting a global: a page opened from a folder may load
      # scripts beside it, but not read files with fetch().
      def script(name, data)
        "window.#{name} = #{JSON.generate(data).gsub("</", "<\\/")};\n"
      end

      # ── The publication-like snapshot ──────────────────────────────────

      def snapshot_publication
        @snapshot_publication ||= begin
          options = MapPublication.normalize_options({
            "feature_layers" => MapFeature::LAYERS,
            "region_layers" => region_layers.map(&:key),
            "hide_networks" => !@include_networks, "hide_address" => false,
            "show_notes" => true, "show_zone_names" => true, "show_aerial_view" => false
          }, map)
          MapPublication.new(map:, title: map.name, description: map.description.to_s, options:,
            snapshot: Collab::PublicSnapshot.new(map, options).build, version: 1, published_at: Time.current, token: "hors-ligne")
        end
      end

      # The aerial photo under the plan and the cadastre over it, as the dossier's cover.
      def region_layers
        @region_layers ||= begin
          catalogue = map.region.catalogue.enabled.to_a.select(&:raster?)
          bases = catalogue.select(&:base?)
          base = bases.find(&:default?) || bases.first
          cadastre = catalogue.find { |l| !l.base? && l.role == "cadastre" }
          [ base, cadastre ].compact
        end
      end

      def bbox
        @bbox ||= map.bbox.presence || boundary_bbox || features_bbox
      end

      def boundary_bbox
        return nil unless map.boundary
        box = RGeo::Cartesian::BoundingBox.create_from_geometry(map.boundary)
        [ box.min_x, box.min_y, box.max_x, box.max_y ]
      end

      def features_bbox
        geometries = map.features.active.map(&:geometry).compact
        return nil if geometries.empty?
        box = RGeo::Cartesian::BoundingBox.new(GeoJsonGeometry::FACTORY)
        geometries.each { |g| box.add(g) }
        [ box.min_x, box.min_y, box.max_x, box.max_y ]
      end

      # ── Tiles ──────────────────────────────────────────────────────────

      # One script per layer: { key => { maxZoom, script } }.
      def pack_tiles
        return {} unless bbox
        region_layers.each_with_object({}) do |layer, packed|
          plan = TilePlan.new(bbox, min_zoom: layer.min_zoom, max_zoom: layer.max_zoom, budget: tile_budget)
          tiles = fetch_tiles(layer, plan.tiles)
          next if tiles.empty?
          name = "donnees/tuiles-#{layer.key.parameterize}.js"
          add(name, "window.TERRANOVA_TILES = window.TERRANOVA_TILES || {};\n" \
                    "window.TERRANOVA_TILES[#{JSON.generate(layer.key)}] = #{JSON.generate(tiles)};\n")
          @summary["tiles"] += tiles.size
          packed[layer.key] = { "maxZoom" => tiles.keys.map { |k| k.to_i }.max, "script" => name }
        end
      end

      # { "z/x/y" => base64 } of the tiles the provider served.
      def fetch_tiles(layer, coordinates)
        proxy = Collab::TileProxy.new(layer)
        queue = Queue.new
        coordinates.each { |c| queue << c }
        results = Concurrent::Map.new
        Array.new(TILE_THREADS) do
          Thread.new do
            Rails.application.executor.wrap do
              loop do
                z, x, y = queue.pop(true)
                tile = proxy.fetch(z, x, y)
                results["#{z}/#{x}/#{y}"] = Base64.strict_encode64(tile.body) if tile
              end
            rescue ThreadError # the queue is empty
            end
          end
        end.each(&:join)
        coordinates.filter_map { |z, x, y| key = "#{z}/#{x}/#{y}"; [ key, results[key] ] if results[key] }.to_h
      end

      # ── Photos and documents ───────────────────────────────────────────

      def pack_photos
        scope = map.photos.with_attached_image.chronological
        scope = scope.images unless editor?
        scope.filter_map { |photo| pack_photo(photo) }
      end

      def pack_photo(photo)
        return nil unless photo.image.attached?
        original = photo.image.blob
        stem = "#{(photo.taken_at || photo.created_at).to_date.iso8601}-#{photo.id}"
        label = photo.caption.presence || original.filename.to_s
        entry = { "id" => photo.id, "kind" => photo.kind, "caption" => photo.caption.presence,
                  "takenAt" => (photo.taken_at || photo.created_at).iso8601, "dated" => photo.taken_at.present?,
                  "lng" => photo.lng, "lat" => photo.lat }
        if photo.video?
          return skip(label, original.byte_size) unless fits?(original.byte_size)
          entry["file"] = "photos/#{stem}#{original.filename.extension_with_delimiter}"
          add_blob(entry["file"], original)
          @packed_bytes += original.byte_size
          @summary["videos"] += 1
        else
          # The photo as the app shows it (JPEG, 1800 px, no EXIF), then,
          # for editors, the original file.
          data = photo.still(:large).processed.download
          return skip(label, data.bytesize) unless fits?(data.bytesize)
          entry["view"] = "photos/#{stem}.jpg"
          add(entry["view"], data)
          @packed_bytes += data.bytesize
          if editor? && fits?(original.byte_size)
            entry["file"] = "photos/originaux/#{stem}#{original.filename.extension_with_delimiter}"
            add_blob(entry["file"], original)
            @packed_bytes += original.byte_size
          end
          @summary["photos"] += 1
        end
        entry
      rescue ActiveStorage::FileNotFoundError, ActiveStorage::Error, Vips::Error => e
        Rails.logger.warn("[offline site] photo #{photo.id}: #{e.class}")
        nil
      end

      def pack_documents
        map.documents.with_attached_file.order(:created_at).filter_map do |document|
          next unless document.file.attached?
          blob = document.file.blob
          label = document.title.presence || blob.filename.to_s
          next skip(label, blob.byte_size) unless fits?(blob.byte_size)
          path = "documents/#{document.id}-#{blob.filename.sanitized}"
          add_blob(path, blob)
          @packed_bytes += blob.byte_size
          @summary["documents"] += 1
          { "id" => document.id, "title" => label, "description" => document.description.presence,
            "tags" => document.tags, "kind" => document.kind, "file" => path, "bytes" => blob.byte_size,
            "createdAt" => document.created_at.iso8601 }
        rescue ActiveStorage::FileNotFoundError, ActiveStorage::Error => e
          Rails.logger.warn("[offline site] document #{document.id}: #{e.class}")
          nil
        end
      end

      # ── What the viewer reads ──────────────────────────────────────────

      def viewer_data(tiles:, photos:, documents:)
        props = snapshot_publication.as_public.deep_stringify_keys
        props["layers"] = props["layers"].filter_map do |layer|
          packed = tiles[layer["key"]] or next
          layer.merge("tiles" => "offline://#{layer["key"]}/{z}/{x}/{y}", "maxZoom" => packed["maxZoom"])
        end
        props.merge("aerialView" => nil, "reliefPath" => nil,
          "offline" => {
            "exportedAt" => Time.current.iso8601, "exportedBy" => @user&.display_name, "networks" => @include_networks,
            "owner" => map.owner.display_name, "photos" => photos, "documents" => documents,
            "skipped" => @summary["skipped"],
            "files" => { "geojson" => "donnees/carte.geojson", "plants" => "donnees/plantes.csv" }
          })
      end

      def plants_csv
        lines = MapPlantInventory.new(map).lines
        CSV.generate(col_sep: ";") do |csv|
          csv << I18n.t("offline_site.csv.headers")
          lines.each { |line| csv << [ line.display_name, line.latin_name, line.quantity, line.planned_quantity, line.placed_count ] }
        end
      end

      def index_html(tiles)
        scripts = [ "donnees/carte.js", *tiles.values.map { |t| t["script"] }, "site/terranova.js" ]
        title = ERB::Util.html_escape(map.name)
        <<~HTML
          <!doctype html>
          <html lang="fr">
          <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta name="generator" content="Semisto Terranova">
          <title>#{title}</title>
          <link rel="stylesheet" href="site/terranova.css">
          </head>
          <body>
          <div id="app"></div>
          <noscript>#{ERB::Util.html_escape(I18n.t("offline_site.noscript"))}</noscript>
          #{scripts.map { |src| %(<script src="#{src}"></script>) }.join("\n")}
          </body>
          </html>
        HTML
      end

      def readme
        lines = I18n.t("offline_site.readme.body", name: map.name, date: I18n.l(@today, format: :long),
          photos: @summary["photos"] + @summary["videos"], documents: @summary["documents"]).dup
        lines << "\n" << I18n.t("offline_site.readme.networks") if @include_networks
        if @summary["skipped"].any?
          lines << "\n" << I18n.t("offline_site.readme.skipped") << "\n"
          @summary["skipped"].each { |s| lines << "- #{s["name"]} (#{ActiveSupport::NumberHelper.number_to_human_size(s["bytes"], locale: :fr)})\n" }
        end
        lines
      end
  end
end
