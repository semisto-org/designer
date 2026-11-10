# The real buildings of the Brussels-Capital Region, roofs included, for the
# 3D relief: UrbIS Buildings 3D (paradigm.brussels, CC0), a LoD2 model of
# every building, updated every month. Where it exists, it replaces the
# OpenStreetMap footprints and the roofs guessed from them.
#
#   models = Providers::UrbisBuildings3d.new(feed_url:, attribution:)
#   models.within(south:, west:, north:, east:) # => [Model, ...]
#
# The region publishes one zip per square kilometre of its Lambert 72 grid
# (EPSG:31370; the tile `154169` covers x 154–155 km, y 169–170 km), listed
# in an ATOM feed with one entry per monthly edition. A model is one solid of
# the dataset: its footprint (the ground surface) and its roof surfaces, each
# a planar polygon with its height above the solid's ground at every corner.
# The walls are not sent: they stand under the roof's edges.
#
# Coordinates leave in WGS84. Over a few hundred metres the Lambert grid is
# an affine image of longitude and latitude to the millimetre, so PostGIS
# converts three corners of the extent and the rest follows from them.
module Providers
  class UrbisBuildings3d
    class Unavailable < BuildingModels::Unavailable; end

    Model = Data.define(:id, :rings, :roofs, :height) do
      def as_json(*) = { id:, rings:, roofs:, height: }
    end

    DEFAULT_FEED = "https://urbisdownload.datastore.brussels/atomfeed/e9ec2aa4-cffd-11ee-bccc-00090ffe0001-en.xml".freeze
    ZIP = %r{https://urbisdownload\.datastore\.brussels/[^"<\s]*/SHP/UrbISBuildings3D_31370_SHP_(\d{6})_(\d{8})\.zip}
    TILE_M = 1000
    # A map's terrain spans a few hundred metres: four tiles at most, nine
    # for a large estate; beyond, it is a district, not a garden.
    MAX_TILES = 9
    FEED_TTL = 1.day
    CACHE_TTL = 35.days
    TIMEOUT = 60
    ROOF = "ROOFSURFACE".freeze
    GROUND = "GROUNDSURFACE".freeze

    def initialize(feed_url: nil, attribution: nil)
      @feed_url = feed_url.presence || DEFAULT_FEED
      @attribution = attribution
    end

    attr_reader :attribution

    def within(south:, west:, north:, east:)
      box = lambert_box(south:, west:, north:, east:)
      tiles = tiles_over(box)
      raise Unavailable, "extent too large" if tiles.size > MAX_TILES

      editions = feed.slice(*tiles)
      return [] if editions.empty?

      key = [ "map_data/buildings3d/urbis/v1", Digest::SHA1.hexdigest(editions.sort.to_s)[0, 10], *[ south, west, north, east ].map { |v| v.to_f.round(5) } ].join("/")
      rows = Rails.cache.fetch(key, expires_in: CACHE_TTL) { models(editions.values, box).map(&:to_h) }
      rows.map { |row| Model.new(**row.symbolize_keys) }
    end

    # The latest edition of every tile: { "154169" => url }.
    def feed
      Rails.cache.fetch([ "map_data/buildings3d/urbis/feed/v1", Digest::SHA1.hexdigest(@feed_url)[0, 8] ].join("/"), expires_in: FEED_TTL) do
        body = GeoHttp.get(@feed_url, timeout: TIMEOUT).body
        latest = {}
        body.scan(ZIP) do |tile, date|
          url = Regexp.last_match(0)
          latest[tile] = [ date, url ] if !latest[tile] || latest[tile][0] < date
        end
        raise Unavailable, "empty feed" if latest.empty?

        latest.transform_values(&:last)
      end
    rescue GeoHttp::Unavailable => e
      raise Unavailable, e.message
    end

    private
      # The extent in Lambert 72, and the affine map back to WGS84.
      def lambert_box(south:, west:, north:, east:)
        corners = transform([ [ west, south ], [ east, south ], [ east, north ], [ west, north ] ], from: 4326, to: 31370)
        xs = corners.map(&:first)
        ys = corners.map(&:last)
        box = [ xs.min, ys.min, xs.max, ys.max ]
        controls = [ [ box[0], box[1] ], [ box[2], box[1] ], [ box[0], box[3] ] ]
        @affine = affine(controls, transform(controls, from: 31370, to: 4326))
        box
      end

      def transform(points, from:, to:)
        sql = ActiveRecord::Base.sanitize_sql_array([ <<~SQL.squish, points.map { Float(_1[0]) }, points.map { Float(_1[1]) }, Integer(from), Integer(to) ])
          SELECT ST_X(g), ST_Y(g)
          FROM unnest(ARRAY[?]::float8[], ARRAY[?]::float8[]) WITH ORDINALITY AS t(x, y, n),
               LATERAL ST_Transform(ST_SetSRID(ST_MakePoint(t.x, t.y), ?), ?) AS g
          ORDER BY t.n
        SQL
        ActiveRecord::Base.connection.select_rows(sql).map { |x, y| [ x.to_f, y.to_f ] }
      end

      # lng = a·x + b·y + c, lat = d·x + e·y + f, from three control points.
      def affine((p0, p1, p2), (q0, q1, q2))
        dx = p1[0] - p0[0]
        dy = p2[1] - p0[1]
        dx = 1.0 if dx.zero?
        dy = 1.0 if dy.zero?
        a = (q1[0] - q0[0]) / dx
        d = (q1[1] - q0[1]) / dx
        b = (q2[0] - q0[0]) / dy
        e = (q2[1] - q0[1]) / dy
        c = q0[0] - a * p0[0] - b * p0[1]
        f = q0[1] - d * p0[0] - e * p0[1]
        ->(x, y) { [ (a * x + b * y + c).round(7), (d * x + e * y + f).round(7) ] }
      end

      def tiles_over(box)
        xs = (box[0] / TILE_M).floor..(box[2] / TILE_M).floor
        ys = (box[1] / TILE_M).floor..(box[3] / TILE_M).floor
        xs.flat_map { |x| ys.map { |y| format("%03d%03d", x, y) } }
      end

      def models(urls, box)
        faces = Hash.new { |h, k| h[k] = { ground: [], roofs: [] } }
        seen = Set.new
        urls.each { |url| read_tile(url, box, faces, seen) }
        faces.filter_map { |solid, parts| model(solid, parts) }
      end

      def read_tile(url, box, faces, seen)
        files = unzip(GeoHttp.get(url, timeout: TIMEOUT, breaker: false).body)
        table = Shapefile::Table.new(files.fetch("dbf"))
        shapes = Shapefile::Shapes.new(files.fetch("shp"), files.fetch("shx"))
        # The solids standing in the extent (by their ground), then all
        # their faces, so that a large building is never cut at its edge.
        solids = Set.new
        table.count.times do |index|
          next unless table.value(index, "TYPE") == GROUND

          shape_box = shapes.box(index)
          solids << solid_id(table, index) if shape_box && overlaps?(shape_box, box)
        end
        table.count.times do |index|
          type = table.value(index, "TYPE")
          next unless (type == ROOF || type == GROUND) && solids.include?(solid = solid_id(table, index))
          next unless seen.add?(table.value(index, "INSPIRE_ID"))

          faces[solid][type == ROOF ? :roofs : :ground] << shapes.rings(index)
        end
      rescue GeoHttp::Unavailable, Shapefile::Error, Zip::Error, KeyError => e
        raise Unavailable, e.message
      end

      # The BuildingFaces layer of a tile's zip: { "shp" => bytes, ... }.
      def unzip(bytes)
        files = {}
        Zip::File.open_buffer(StringIO.new(bytes)) do |zip|
          zip.each do |entry|
            extension = entry.name[/_BuildingFaces\.(shp|shx|dbf)\z/i, 1]
            files[extension.downcase] = entry.get_input_stream.read if extension
          end
        end
        files
      end

      def solid_id(table, index) = table.value(index, "BUSOLID_ID").to_s[/\d+\z/]

      def overlaps?(a, b) = a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]

      # One solid: footprint in WGS84, roofs with their height above its
      # ground (the lowest point of its ground surface).
      def model(solid, parts)
        ground_rings = parts[:ground].flatten
        return nil if ground_rings.empty? || parts[:roofs].empty?

        base = ground_rings.flat_map { |ring| ring.points.map(&:last) }.min
        rings = ground_rings.map { |ring| ring.points.map { |x, y, _| @affine.(x, y) } }
        roofs = parts[:roofs].flat_map { |face_rings| polygons(face_rings, base) }
        return nil if roofs.empty?

        height = roofs.flatten(1).flat_map { |ring| ring.map(&:last) }.max
        Model.new(id: "urbis-#{solid}", rings:, roofs:, height:)
      end

      # A face's rings as polygons: an outer ring, then its holes, each
      # point [lng, lat, height above the ground].
      def polygons(face_rings, base)
        face_rings.each_with_object([]) do |ring, out|
          points = ring.points.map { |x, y, z| [ *@affine.(x, y), (z - base).round(2) ] }
          if ring.outer || out.empty? then out << [ points ] else out.last << points end
        end
      end
  end
end
