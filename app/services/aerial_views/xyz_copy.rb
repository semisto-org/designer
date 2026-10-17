# Copies a drone view set up as an XYZ address (tiles hosted elsewhere, read
# by the browser) into one MBTiles file, which AerialViews::Import then packs
# like any imported file: the view stops depending on the host that served
# it. Fetches every tile over the map's outline, with a margin, at every zoom
# from the view's minimum to its maximum (the strongest zoom the host
# answers at the map's centre when the view does not say). A tile the host
# does not have (404) is the edge of the flight and is skipped; a refused
# address (a redirect to a login page, a 403) or a host that keeps failing
# stops the copy.
module AerialViews
  class XyzCopy
    MARGIN_METERS = 150
    MAX_TILES = 250_000
    ATTEMPTS = 3
    MAGICS = { "png" => "\x89PNG".b, "jpg" => "\xFF\xD8\xFF".b, "webp" => "RIFF".b }.freeze

    def initialize(view, workdir, connection: nil)
      @view = view
      @workdir = workdir.to_s
      @connection = connection
    end

    # The path of the MBTiles file.
    def call
      west, south, east, north = area
      max = @view.max_zoom || strongest_zoom or raise Tiler::Failure.new("empty", "no tile at the map's centre")
      min = (@view.min_zoom || max - 8).clamp(0, max)
      ranges = (min..max).to_h { |z| [ z, tile_range(west, south, east, north, z) ] }
      count = ranges.sum { |_, (xs, ys)| xs.size * ys.size }
      raise Tiler::Failure.new("conversion_failed", "#{count} tiles") if count > MAX_TILES
      write(ranges, min, max)
    end

    private
      # The map's outline and a margin around it, as west, south, east, north.
      def area
        bbox = @view.map.bbox or raise Tiler::Failure.new("empty", "the map has no outline")
        lat = (bbox[1] + bbox[3]) / 2
        dlat = MARGIN_METERS / 111_320.0
        dlng = dlat / Math.cos(lat * Math::PI / 180)
        [ bbox[0] - dlng, bbox[1] - dlat, bbox[2] + dlng, bbox[3] + dlat ]
      end

      def strongest_zoom
        bbox = @view.map.bbox
        lng, lat = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
        AerialView::MAX_ZOOM.downto(10).find { |z| fetch(z, *tile_at(lng, lat, z)) }
      end

      def tile_range(west, south, east, north, z)
        x0, y0 = tile_at(west, north, z)
        x1, y1 = tile_at(east, south, z)
        [ (x0..x1), (y0..y1) ]
      end

      def tile_at(lng, lat, z)
        n = 2**z
        rad = lat * Math::PI / 180
        x = ((lng + 180) / 360 * n).floor
        y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math::PI) / 2 * n).floor
        [ x.clamp(0, n - 1), y.clamp(0, n - 1) ]
      end

      def write(ranges, min, max)
        path = File.join(@workdir, "copy.mbtiles")
        db = SQLite3::Database.new(path)
        db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
        db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
        db.execute("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)")
        format = nil
        found = { x: [], y: [] }
        ranges.each do |z, (xs, ys)|
          db.transaction do
            xs.each do |x|
              ys.each do |y|
                data = fetch(z, x, y) or next
                format ||= MAGICS.find { |_, magic| data.start_with?(magic) }&.first
                # MBTiles counts rows from the south (TMS).
                db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", [ z, x, 2**z - 1 - y, SQLite3::Blob.new(data) ])
                if z == max
                  found[:x] << x
                  found[:y] << y
                end
              end
            end
          end
        end
        raise Tiler::Failure.new("empty") if format.nil?
        metadata(db, format, min, max, found)
        path
      ensure
        db&.close
      end

      def metadata(db, format, min, max, found)
        west, north = corner(found[:x].min, found[:y].min, max)
        east, south = corner(found[:x].max + 1, found[:y].max + 1, max)
        {
          name: @view.name, format:, type: "baselayer", minzoom: min, maxzoom: max,
          bounds: [ west, south, east, north ].map { _1.round(7) }.join(",")
        }.each { |name, value| db.execute("INSERT INTO metadata VALUES (?, ?)", [ name.to_s, value.to_s ]) }
      end

      # The north-west corner of tile x, y as longitude, latitude.
      def corner(x, y, z)
        n = 2.0**z
        [ x / n * 360 - 180, Math.atan(Math.sinh(Math::PI * (1 - 2 * y / n))) * 180 / Math::PI ]
      end

      # The tile's bytes, nil where the host has none.
      def fetch(z, x, y)
        url = @view.url.gsub("{z}", z.to_s).gsub("{x}", x.to_s).gsub("{y}", y.to_s)
        attempt = 0
        begin
          attempt += 1
          response = connection.get(url)
          return nil if [ 204, 404 ].include?(response.status)
          raise Faraday::ServerError, "status #{response.status}" if response.status >= 500
          raise Tiler::Failure.new("source_unreachable", "status #{response.status}") unless response.status == 200
          body = response.body.to_s.b
          MAGICS.values.any? { body.start_with?(_1) } ? body : nil
        rescue Faraday::Error => error
          raise Tiler::Failure.new("source_unreachable", error.message) if attempt >= ATTEMPTS
          sleep(attempt) unless Rails.env.test?
          retry
        end
      end

      def connection
        @connection ||= Faraday.new(request: { open_timeout: 10, timeout: 30 }) do |f|
          f.headers["User-Agent"] = "SemistoTerranova/1.0"
        end
      end
  end
end
