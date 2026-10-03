module Collab
  # Builds the frozen copy of a map that a public view serves: the terrain
  # outline, the chosen layers' features and the keys of the region layers.
  # This is the privacy boundary of the public view: everything that must not
  # leave (networks, address, parcels, notes, drafts, who made what) is
  # dropped HERE, at publication time, and never reaches the snapshot.
  class PublicSnapshot
    FORMAT = 1

    def initialize(map, options)
      @map = map
      @options = options
    end

    def build
      {
        "format" => FORMAT,
        "taken_at" => Time.current.iso8601,
        "map" => map_data,
        "features" => features,
        "region_layer_keys" => region_layer_keys
      }
    end

    # Region layers that must stay private when networks are hidden: utility
    # networks (water, gas, electricity, ethernet) published by the region.
    def self.sensitive_region_layer?(layer)
      layer.options["sensitive"] == true || layer.options["network"] == true ||
        [ layer.key, layer.group_name ].compact.any? { |s| s.match?(/network|r[eé]seau/i) }
    end

    private
      def map_data
        data = {
          "stage" => @map.stage,
          "area_m2" => @map.area_m2,
          "boundary" => @map.geometry_geojson(:boundary),
          "center" => @map.center && [ @map.center.x, @map.center.y ],
          "zoom" => @map.zoom,
          "bbox" => @map.bbox,
          "region" => @map.region.as_inertia.deep_stringify_keys
        }
        unless @options["hide_address"]
          data["address"] = @map.address
          data["parcels"] = @map.parcels
        end
        data
      end

      def layers
        wanted = @options["feature_layers"]
        wanted -= %w[networks] if @options["hide_networks"]
        wanted
      end

      def features
        scope = @map.features.active.where(layer: layers).order(:id)
        scope.map { |feature| serialize(feature) }
      end

      def serialize(feature)
        properties = {
          "id" => feature.id, "layer" => feature.layer, "kind" => feature.kind,
          "name" => feature.name, "style" => feature.style
        }
        properties["notes"] = feature.notes if @options["show_notes"]
        { "type" => "Feature", "id" => feature.id, "geometry" => feature.geometry_geojson, "properties" => properties }
      end

      def region_layer_keys
        scope = @map.region.layers.enabled.where(key: @options["region_layers"])
        scope = scope.reject { |layer| self.class.sensitive_region_layer?(layer) } if @options["hide_networks"]
        scope.map(&:key)
      end
  end
end
