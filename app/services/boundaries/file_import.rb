# Terrain outline from a file: GeoJSON (Feature, FeatureCollection,
# geometry) or KML (Google Earth, My Maps, QGIS). Every polygon in the file
# is merged into the boundary. GeoJSON in a projected CRS (declared with
# `crs`, or coordinates in meters) is reprojected from the CRS the file
# names, else from the region's (`settings.crs`, EPSG:31370 for Wallonia).
module Boundaries
  class FileImport
    class Error < StandardError; end

    MAX_BYTES = 5.megabytes
    MAX_POLYGONS = 500
    MAX_AREA_M2 = 100_000_000 # 10 000 ha

    def initialize(map, file)
      @map = map
      @file = file
    end

    def call
      raise error(:missing) unless @file.respond_to?(:read)
      raise error(:too_large) if @file.size.to_i > MAX_BYTES

      content = @file.read.to_s.dup.force_encoding("UTF-8").scrub.delete_prefix("\uFEFF")
      polygons, srid = kml?(content) ? [ kml_polygons(content), 4326 ] : geojson_polygons(content)
      raise error(:no_polygon) if polygons.empty?
      raise error(:too_many) if polygons.size > MAX_POLYGONS

      geometry = GeometryUnion.call(polygons, srid:)
      check!(geometry)
      @map.update!(boundary: geometry)
      @map
    rescue GeometryUnion::Empty
      raise error(:invalid)
    end

    private
      def error(key) = Error.new(I18n.t("map_data.import.errors.#{key}"))

      def kml?(content)
        File.extname(@file.try(:original_filename).to_s).casecmp?(".kml") || content.lstrip.start_with?("<")
      end

      # -- GeoJSON -----------------------------------------------------------

      def geojson_polygons(content)
        json = JSON.parse(content)
        raise error(:invalid) unless json.is_a?(Hash)
        polygons = collect_geojson(json)
        [ polygons, geojson_srid(json, polygons) ]
      rescue JSON::ParserError
        raise error(:invalid)
      end

      def collect_geojson(node)
        return [] unless node.is_a?(Hash)
        case node["type"]
        when "FeatureCollection" then Array(node["features"]).flat_map { |f| collect_geojson(f) }
        when "Feature" then collect_geojson(node["geometry"])
        when "GeometryCollection" then Array(node["geometries"]).flat_map { |g| collect_geojson(g) }
        when "Polygon", "MultiPolygon" then [ { "type" => node["type"], "coordinates" => node["coordinates"] } ]
        else []
        end
      end

      def geojson_srid(json, polygons)
        named = json.dig("crs", "properties", "name").to_s[/(?:EPSG)?:+(\d{4,5})\z/, 1]
        return named.to_i if named && named != "4326" && named != "84"
        return 4326 if named
        projected?(polygons) ? region_srid : 4326
      end

      def projected?(polygons)
        x, y = polygons.lazy.map { |p| first_position(p["coordinates"]) }.find { |pos| pos }
        x && (x.abs > 180 || y.abs > 90)
      end

      def first_position(coords)
        coords = coords.first while coords.is_a?(Array) && coords.first.is_a?(Array)
        coords.is_a?(Array) && coords.size >= 2 ? coords.first(2).map(&:to_f) : nil
      end

      def region_srid
        @map.region.setting(:crs).to_s[/\d{4,5}/]&.to_i || raise(error(:projection))
      end

      # -- KML ---------------------------------------------------------------

      def kml_polygons(content)
        doc = Nokogiri::XML(content) { |config| config.strict.nonet }
        doc.remove_namespaces!
        doc.xpath("//Polygon").filter_map do |polygon|
          outer = kml_ring(polygon.at_xpath("./outerBoundaryIs//coordinates"))
          next unless outer
          holes = polygon.xpath("./innerBoundaryIs//coordinates").filter_map { |c| kml_ring(c) }
          { "type" => "Polygon", "coordinates" => [ outer, *holes ] }
        end
      rescue Nokogiri::XML::SyntaxError
        raise error(:invalid)
      end

      def kml_ring(node)
        return nil unless node
        points = node.text.split(/\s+/).filter_map do |tuple|
          lng, lat = tuple.split(",").first(2).map { |v| Float(v) }
          [ lng, lat ] if lng && lat
        rescue ArgumentError, TypeError
          nil
        end
        points << points.first if points.any? && points.first != points.last
        points.size >= 4 ? points : nil
      end

      # -- result ------------------------------------------------------------

      def check!(geometry)
        area = ActiveRecord::Base.connection.select_value(
          "SELECT ST_Area(ST_GeomFromGeoJSON(#{ActiveRecord::Base.connection.quote(geometry.to_json)})::geography)"
        ).to_f
        raise error(:too_big) if area > MAX_AREA_M2
        raise error(:outside_region) unless inside_region?(geometry)
      end

      def inside_region?(geometry)
        bounds = @map.region.bounds
        return true unless bounds
        ActiveRecord::Base.connection.select_value(<<~SQL.squish)
          SELECT ST_Intersects(ST_SetSRID(ST_GeomFromGeoJSON(#{ActiveRecord::Base.connection.quote(geometry.to_json)}), 4326),
                               ST_GeomFromText(#{ActiveRecord::Base.connection.quote(bounds.as_text)}, 4326))
        SQL
      end
  end
end
