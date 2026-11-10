# Moves an imported drone view where it belongs (« Recaler la vue »): the
# landmark pairs of its pending alignment (AerialView#alignments, see
# Alignment) become a new PMTiles archive, cut again from the one already
# stored, since the original file is never kept.
#
# 1. The archive's tiles at its strongest zoom go into an MBTiles file (PNG,
#    which every GDAL reads), with the archive's extent.
# 2. A VRT over it carries the moved geotransform (shift, and the turn and
#    scale of two or three pairs).
# 3. gdalwarp lays it back flat in Web Mercator as a GeoTIFF, which Tiler
#    cuts and packs like any import.
#
# The view keeps showing its old tiles meanwhile; the new archive replaces
# them in one step (the old one is purged), so the map never goes blank.
module AerialViews
  class Realign
    MAX_TILES = 400_000

    def initialize(view)
      @view = view
    end

    def call
      entry = @view.pending_alignment or return @view
      alignment = Alignment.new(entry["pairs"])
      raise Tiler::Failure.new("empty", "no archive") unless @view.archive.attached? && @view.bounds.present?
      Dir.mktmpdir("realign-#{@view.id}-", Import.work_root) do |dir|
        source = File.join(dir, "view.pmtiles")
        @view.archive.blob.open { |file| FileUtils.cp(file.path, source) }
        mbtiles = mosaic(source, dir)
        moved = moved_vrt(mbtiles, alignment, dir)
        flat = File.join(dir, "aligned.tif")
        run!("gdalwarp", "-q", "-t_srs", "EPSG:3857", "-r", "bilinear", "-srcalpha", "-dstalpha", "-overwrite",
          "-co", "TILED=YES", "-co", "COMPRESS=DEFLATE", "-co", "BIGTIFF=IF_SAFER", moved, flat)
        tiles = File.join(dir, "tiles").tap { FileUtils.mkdir_p(_1) }
        archive = Tiler.new(flat, tiles, product: "orthophoto").call
        store(archive, alignment) if @view.reload.pending_alignment
      end
      @view
    rescue Alignment::Invalid => invalid
      @view.finish_alignment!("failed", failure: invalid.code)
    rescue Tiler::Failure => failure
      Rails.logger.info("[aerial_views] view #{@view.id} not realigned: #{failure.message}")
      @view.finish_alignment!("failed", failure: failure.code)
    end

    private
      # The strongest zoom of the archive, tile by tile, into an MBTiles file.
      def mosaic(source, dir)
        reader = PmtilesReader.new(cache_key: "realign-#{@view.id}-#{SecureRandom.hex(4)}") do |offset, length|
          File.open(source, "rb") { |file| file.seek(offset) && file.read(length) }
        end
        z = reader.header[:max_zoom]
        bounds = @view.bounds
        x0, y0 = tile_at(bounds["west"], bounds["north"], z)
        x1, y1 = tile_at(bounds["east"], bounds["south"], z)
        count = (x1 - x0 + 1) * (y1 - y0 + 1)
        raise Tiler::Failure.new("conversion_failed", "#{count} tiles") if count > MAX_TILES

        path = File.join(dir, "mosaic.mbtiles")
        db = SQLite3::Database.new(path)
        db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
        db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
        db.execute("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)")
        found = 0
        (x0..x1).each_slice(16) do |columns|
          db.transaction do
            columns.each do |x|
              (y0..y1).each do |y|
                bytes, = reader.tile(z, x, y)
                next unless bytes
                # MBTiles counts rows from the south (TMS).
                db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", [ z, x, (1 << z) - 1 - y, SQLite3::Blob.new(png(bytes)) ])
                found += 1
              end
            end
          end
        end
        raise Tiler::Failure.new("empty") if found.zero?
        west, north = corner(x0, y0, z)
        east, south = corner(x1 + 1, y1 + 1, z)
        { name: @view.name, format: "png", type: "baselayer", minzoom: z, maxzoom: z,
          bounds: [ west, south, east, north ].map { _1.round(8) }.join(",") }
          .each { |name, value| db.execute("INSERT INTO metadata VALUES (?, ?)", [ name.to_s, value.to_s ]) }
        path
      ensure
        db&.close
      end

      def png(bytes)
        image = Vips::Image.new_from_buffer(bytes.to_s, "")
        image = image.bandjoin(255) unless image.has_alpha?
        image.pngsave_buffer(compression: 1)
      end

      # A VRT over the mosaic, its geotransform moved by the alignment.
      def moved_vrt(mbtiles, alignment, dir)
        vrt = File.join(dir, "moved.vrt")
        run!("gdal_translate", "-q", "-of", "VRT", "-oo", "BAND_COUNT=4", mbtiles, vrt)
        xml = File.read(vrt)
        gt = xml[%r{<GeoTransform>([^<]+)</GeoTransform>}, 1] or raise Tiler::Failure.new("conversion_failed", "no geotransform")
        moved = alignment.geo_transform(gt.split(",").map { Float(_1) })
        File.write(vrt, xml.sub(%r{<GeoTransform>[^<]+</GeoTransform>}, "<GeoTransform>#{moved.map { format('%.12e', _1) }.join(', ')}</GeoTransform>"))
        vrt
      end

      def store(path, alignment)
        header = PmtilesHeader.read(path)
        File.open(path, "rb") do |file|
          @view.archive.attach(io: file, filename: "vue-drone-#{@view.captured_on.iso8601}.pmtiles",
            content_type: "application/vnd.pmtiles", identify: false)
        end
        @view.update!(min_zoom: header.min_zoom, max_zoom: header.max_zoom.clamp(0, AerialView::MAX_ZOOM), bounds: header.bounds)
        @view.finish_alignment!("done", shift_m: alignment.shift_m(@view.bounds))
      end

      def tile_at(lng, lat, z)
        n = 1 << z
        rad = lat * Math::PI / 180
        x = ((lng + 180) / 360 * n).floor
        y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math::PI) / 2 * n).floor
        [ x.clamp(0, n - 1), y.clamp(0, n - 1) ]
      end

      def corner(x, y, z)
        n = 2.0**z
        [ x / n * 360 - 180, Math.atan(Math.sinh(Math::PI * (1 - 2 * y / n))) * 180 / Math::PI ]
      end

      def run!(*command)
        stdout, stderr, status = Open3.capture3("timeout", Tiler::COMMAND_TIMEOUT.to_i.to_s, *command.map(&:to_s))
        return stdout if status.success?
        Rails.logger.warn("[aerial_views] #{command.first} failed (#{status.exitstatus}): #{stderr.to_s.last(2000)}")
        raise Tiler::Failure.new("conversion_failed", stderr.to_s.last(300))
      rescue Errno::ENOENT => error
        raise Tiler::Failure.new("conversion_failed", error.message)
      end
  end
end
