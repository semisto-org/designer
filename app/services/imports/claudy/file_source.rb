module Imports
  module Claudy
    # Claudy's map read from a file, for an import without network access.
    # Three shapes are accepted (docs/import-claudy.md):
    #
    # 1. The export written in Claudy by `bin/rails runner` (recommended):
    #    { "format": "claudy-map-export", "version": 1, "map_layers": […],
    #      "map_features": […], "plants": […], "map_sketches": […] }
    #    Features and plants are rendered by Claudy's own API views
    #    (`api/v1/*/show`, with `notes_log` and `photos`); each photo carries
    #    a `path` to its file, relative to the export.
    # 2. A response of the API saved as is: { "data": […], "meta": {…} }.
    # 3. A GeoJSON FeatureCollection whose features carry Claudy's map
    #    properties (`GET /map/features.json`: id, feature_kind, layer_id,
    #    name, properties, network…). The layer is guessed when absent.
    class FileSource
      FORMAT = "claudy-map-export".freeze
      GEOJSON_ID = "geojson".freeze

      attr_reader :path, :map_features, :plants, :map_layers, :sketches

      def initialize(path, client: Client.new(url: nil, key: nil))
        @path = Pathname(path.to_s).expand_path
        @client = client
        @map_features = []
        @plants = []
        @map_layers = []
        @sketches = nil
        load!
      end

      def label = I18n.t("claudy_import.report.source_file", path: path.to_s)

      # Details travel with each row in a file.
      def feature_detail(row) = row
      def plant_detail(row) = row

      def photo_file(photo, max_bytes:)
        if photo["path"].present?
          file = local_file(photo["path"])
          raise Error.new(:photo_too_large, url: photo["path"], max: max_bytes / 1.megabyte) if file.size > max_bytes
          type = photo["content_type"].presence || Marcel::MimeType.for(file)
          Client::Download.new(body: file.binread, content_type: type, filename: photo["filename"].presence || file.basename.to_s)
        elsif photo["url"].present?
          @client.download(photo["url"], max_bytes:)
        else
          raise Error.new(:photo_missing)
        end
      end

      private
        def load!
          raise Error.new(:file_missing, path: path.to_s) unless path.file?
          data = JSON.parse(path.read)
          if data.is_a?(Hash) && data["format"] == FORMAT
            load_export(data)
          elsif data.is_a?(Hash) && data["type"] == "FeatureCollection"
            load_geojson(data)
          elsif data.is_a?(Hash) && data.key?("data")
            load_rows(Array.wrap(data["data"]))
          elsif data.is_a?(Array)
            load_rows(data)
          else
            raise Error.new(:file_format, path: path.to_s)
          end
        rescue JSON::ParserError, Encoding::UndefinedConversionError => error
          raise Error.new(:file_unreadable, path: path.to_s, detail: error.message.truncate(80))
        end

        def load_export(data)
          @map_layers = rows(data["map_layers"])
          @map_features = rows(data["map_features"])
          @plants = rows(data["plants"])
          @sketches = rows(data["map_sketches"])
        end

        def load_rows(list)
          list.grep(Hash).each do |row|
            case row["type"]
            when "plant" then @plants << row
            when "map_feature", nil then @map_features << row if row.key?("geometry")
            end
          end
        end

        def rows(value) = Array(value).grep(Hash)

        # A file next to the export, never outside its folder.
        def local_file(relative)
          root = path.dirname
          file = root.join(relative.to_s).expand_path
          inside = file.to_s.start_with?("#{root}/")
          raise Error.new(:photo_file_missing, path: relative.to_s) unless inside && file.file?
          file
        end

        def load_geojson(collection)
          Array(collection["features"]).grep(Hash).each do |feature|
            props = feature["properties"].is_a?(Hash) ? feature["properties"] : {}
            if props["feature_kind"] == "plant" || props.key?("plant_id")
              plant = plant_from_geojson(feature, props)
              @plants << plant if plant
            else
              @map_features << feature_from_geojson(feature, props)
            end
          end
        end

        def feature_from_geojson(feature, props)
          geometry = feature["geometry"]
          kind = props["feature_kind"].presence || kind_for_geometry(geometry)
          {
            "id" => props["id"] || feature["id"] || "#{GEOJSON_ID}-#{Digest::SHA1.hexdigest(geometry.to_json)[0, 16]}",
            "type" => "map_feature",
            "feature_kind" => kind,
            "layer_id" => props["layer_id"],
            "layer_kind" => props["layer_kind"].presence || guess_layer_kind(kind, props),
            "network" => props["network"],
            "name" => props["name"],
            "name_i18n" => props["name_i18n"].is_a?(Hash) ? props["name_i18n"] : { "fr" => props["name"] }.compact,
            "description_i18n" => props["description_i18n"].is_a?(Hash) ? props["description_i18n"] : { "fr" => props["description"] }.compact,
            "geometry" => geometry,
            "properties" => props["properties"].is_a?(Hash) ? props["properties"] : {}
          }
        end

        def plant_from_geojson(feature, props)
          lng, lat = feature.dig("geometry", "coordinates") if feature.dig("geometry", "type") == "Point"
          {
            "id" => props["plant_id"] || props["id"] || feature["id"],
            "type" => "plant",
            "name" => props["name"],
            "number_label" => props["number"],
            "status" => props["status"],
            "health" => props["health"],
            "stratum" => props["stratum"],
            "species" => props["species"].present? ? { "name" => props["species"], "latin_name" => props["species_latin"] } : nil,
            "latitude" => lat,
            "longitude" => lng
          }
        end

        def kind_for_geometry(geometry)
          case geometry.is_a?(Hash) && geometry["type"]
          when "Polygon", "MultiPolygon" then "zone"
          when "LineString", "MultiLineString" then "path"
          else "point"
          end
        end

        # Claudy's map GeoJSON has no layer kind: the merged properties tell it.
        def guess_layer_kind(kind, props)
          return "network" if props["network"].present? || %w[node line].include?(kind)
          return "design" if props["design"].is_a?(Hash)
          return "biodiversity" if kind == "observation" || props["realm"].present?
          return "bioindicators" if kind == "bioindicator"
          return "comments" if kind == "comment" || props.key?("comments_count")
          return "venues" if %w[lodging space].include?(kind) || Array(props["venue_keys"]).any?
          raw = props["properties"].is_a?(Hash) ? props["properties"] : {}
          return "welcome" if raw["access"].present? || raw["icon"].present?
          "management"
        end
    end
  end
end
