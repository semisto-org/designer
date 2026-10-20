# Turns the file someone imports as a drone view into one PMTiles raster
# archive the map reads tile by tile:
# - a GeoTIFF (what DJI Terra, WebODM, Pix4D, Agisoft or Maps Made Easy
#   export): GDAL cuts it into web tiles (MBTiles, reprojected to Web
#   Mercator, overviews down to a single tile), each tile becomes WebP (a
#   third of a PNG, and unlike JPEG it keeps the transparent edges of the
#   flight), then `pmtiles convert` packs them;
# - an MBTiles of raster tiles: packed as it is (PNG tiles go to WebP first);
# - a PMTiles archive of raster tiles: kept as it is.
#
# A single-band GeoTIFF (a drone's elevation model, a thermal mosaic in
# degrees, a vegetation index such as NDVI) is coloured first with
# `gdaldem color-relief`, along a ramp chosen by the view's `product`
# (AerialView::PRODUCTS) and stretched between the file's own lowest and
# highest values, its no-data left transparent.
#
# Everything happens in `workdir`, which the caller removes. The tools are
# command-line programs of the server image (gdal-bin and go-pmtiles, see the
# Dockerfile); PMTILES_BIN names another pmtiles binary.
module AerialViews
  class Tiler
    # Why the file cannot become a view: one of AerialView::FAILURES.
    class Failure < StandardError
      attr_reader :code

      def initialize(code, detail = nil)
        @code = code
        super([ code, detail ].compact.join(": "))
      end
    end

    # A large estate at a few centimetres takes a while; a stuck tool does not hold the queue forever.
    COMMAND_TIMEOUT = 4.hours
    WEBP_QUALITY = 82
    TIFF_MAGICS = [ "II*\0", "MM\0*", "II+\0", "MM\0+" ].map(&:b).freeze
    SQLITE_MAGIC = "SQLite format 3\0".b

    def self.pmtiles_bin = ENV.fetch("PMTILES_BIN", "pmtiles")

    # Colour ramps for one-band rasters, from the lowest value to the
    # highest (percentages of the file's range, as gdaldem reads them).
    RAMPS = {
      "elevation" => [ [ 0, "45 94 62" ], [ 25, "122 154 92" ], [ 50, "214 196 132" ], [ 75, "166 120 78" ], [ 100, "245 240 230" ] ],
      "thermal" => [ [ 0, "20 24 82" ], [ 25, "84 40 140" ], [ 50, "190 54 104" ], [ 75, "240 128 40" ], [ 100, "252 238 120" ] ],
      "multispectral" => [ [ 0, "165 38 38" ], [ 25, "228 140 60" ], [ 50, "246 228 140" ], [ 75, "128 186 84" ], [ 100, "30 110 50" ] ]
    }.freeze

    def initialize(source, workdir, product: nil)
      @source = source.to_s
      @workdir = workdir.to_s
      @product = product.to_s
    end

    # The path of the archive, ready to be stored.
    def call
      case format
      when :pmtiles then check_pmtiles(@source)
      when :mbtiles then pack(prepare_mbtiles(@source))
      when :geotiff then pack(tile_geotiff)
      else raise Failure.new("unsupported_format")
      end
    end

    def format
      head = File.binread(@source, 16).to_s
      return :pmtiles if head.start_with?(PmtilesHeader::MAGIC)
      return :mbtiles if head.start_with?(SQLITE_MAGIC)
      :geotiff if TIFF_MAGICS.any? { head.start_with?(_1) }
    end

    private
      def check_pmtiles(path)
        header = PmtilesHeader.read(path) or raise Failure.new("unsupported_format", "not a PMTiles v3 archive")
        raise Failure.new("not_raster", header.tile_type) unless header.raster?
        raise Failure.new("empty") if header.addressed_tiles.zero?
        path
      end

      def tile_geotiff
        info = gdalinfo
        raise Failure.new("not_georeferenced") if info.dig("coordinateSystem", "wkt").blank? || info["geoTransform"].blank?
        source = @source
        if info.fetch("bands", []).size == 1
          source = colour_relief
          bands = [ 1, 2, 3, 4 ]
        else
          bands = photo_bands(info.fetch("bands", []))
        end
        mbtiles = File.join(@workdir, "tiles.mbtiles")
        run!("gdal_translate", "-q", "-of", "MBTILES", *bands.flat_map { [ "-b", _1.to_s ] },
          "-co", "TILE_FORMAT=PNG", "-co", "RESAMPLING=BILINEAR", source, mbtiles)
        run!("gdaladdo", "-q", "-r", "average", mbtiles)
        prepare_mbtiles(mbtiles)
      end

      # The one band in colours, along the product's ramp (relief by default).
      def colour_relief
        ramp = File.join(@workdir, "ramp.txt")
        steps = RAMPS.fetch(@product, RAMPS["elevation"])
        File.write(ramp, (steps.map { |percent, rgb| "#{percent}% #{rgb}" } + [ "nv 0 0 0 0" ]).join("\n") + "\n")
        coloured = File.join(@workdir, "coloured.tif")
        run!("gdaldem", "color-relief", "-q", "-alpha", "-of", "GTiff", @source, ramp, coloured)
        coloured
      end

      def gdalinfo
        JSON.parse(run!("gdalinfo", "-json", @source))
      rescue JSON::ParserError
        raise Failure.new("unsupported_format", "gdalinfo")
      end

      # Red, green, blue and the transparency of the flight's edges, from
      # the band colours when the file names them (a multispectral camera
      # adds others), else the first three bands and a fourth as alpha.
      def photo_bands(bands)
        raise Failure.new("not_raster", "#{bands.size} band(s)") if bands.size < 3
        by_colour = bands.to_h { [ _1["colorInterpretation"].to_s.downcase, _1["band"] ] }
        rgb = by_colour.values_at("red", "green", "blue")
        return rgb + [ by_colour["alpha"] ].compact if rgb.all?
        alpha = bands[3] && bands[3]["colorInterpretation"].to_s.casecmp?("alpha") ? 4 : nil
        [ 1, 2, 3, alpha ].compact
      end

      # Checks the MBTiles holds raster tiles, and turns PNG tiles into WebP.
      def prepare_mbtiles(path)
        db = SQLite3::Database.new(path)
        tile_format = db.get_first_value("SELECT value FROM metadata WHERE name = 'format'").to_s.downcase
        raise Failure.new("not_raster", tile_format) unless %w[png jpg jpeg webp].include?(tile_format)
        raise Failure.new("empty") if db.get_first_value("SELECT count(*) FROM tiles").to_i.zero?
        to_webp(db) if tile_format == "png"
        path
      rescue SQLite3::Exception => error
        raise Failure.new("unsupported_format", error.message)
      ensure
        db&.close
      end

      # Each tile again as WebP: lossy for the photo, its alpha kept only
      # where the flight ends inside the tile; a tile with nothing left is
      # dropped. Written in batches, so a large estate never sits in memory.
      def to_webp(db)
        keys = db.execute("SELECT zoom_level, tile_column, tile_row FROM tiles")
        keys.each_slice(500) do |batch|
          db.transaction do
            batch.each do |z, x, y|
              data = db.get_first_value("SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?", [ z, x, y ])
              webp = webp_tile(data)
              if webp
                db.execute("UPDATE tiles SET tile_data = ? WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?", [ SQLite3::Blob.new(webp), z, x, y ])
              else
                db.execute("DELETE FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?", [ z, x, y ])
              end
            end
          end
        end
        db.execute("UPDATE metadata SET value = 'webp' WHERE name = 'format'")
      end

      def webp_tile(data)
        image = Vips::Image.new_from_buffer(data.to_s, "")
        if image.has_alpha?
          alpha = image.extract_band(image.bands - 1)
          return nil if alpha.max.zero?
          image = image.extract_band(0, n: image.bands - 1) if alpha.min == 255
        end
        image.webpsave_buffer(Q: WEBP_QUALITY, strip: true)
      end

      def pack(mbtiles)
        out = File.join(@workdir, "view.pmtiles")
        run!(self.class.pmtiles_bin, "convert", mbtiles, out)
        check_pmtiles(out)
      end

      # Runs a tool, its output back; a failure keeps the end of what it said.
      def run!(*command)
        stdout, stderr, status = Open3.capture3("timeout", COMMAND_TIMEOUT.to_i.to_s, *command.map(&:to_s))
        return stdout if status.success?
        Rails.logger.warn("[aerial_views] #{command.first} failed (#{status.exitstatus}): #{stderr.to_s.last(2000)}")
        raise Failure.new("not_georeferenced", stderr.to_s.last(300)) if command.first == "gdal_translate" && stderr.include?("georeferenc")
        raise Failure.new(command.first == "gdalinfo" ? "unsupported_format" : "conversion_failed", stderr.to_s.last(300))
      rescue Errno::ENOENT => error
        raise Failure.new("conversion_failed", error.message)
      end
  end
end
