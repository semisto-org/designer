module Collab
  # Builds the frozen copy of a map that a public view serves: the terrain
  # outline, the chosen layers' features and the keys of the region layers.
  # This is the privacy boundary of the public view: everything that must not
  # leave (networks, address, parcels, notes, drafts, who made what) is
  # dropped HERE, at publication time, and never reaches the snapshot.
  class PublicSnapshot
    FORMAT = 1
    # The dimensions the public 3D view digs water works with (ponds,
    # swales, dams…): sizes only, nothing about who or why.
    EARTHWORK_KINDS = %w[pond swale keyline ditch check_dam beaver_dam_analogue fascine hedge_bank half_moon grass_strip].freeze
    EARTHWORK_PROPERTIES = %w[depth_m depth width_m width berm height_m material spacing_m diameter_m use cover].freeze

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
        "region_layer_keys" => region_layer_keys,
        "growth" => growth,
        # The newest drone view at publication, only when the owner shows it.
        "aerial_view_id" => (@map.aerial_views.ready.first&.id if @options["show_aerial_view"])
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
        @features ||= @map.features.active.where(layer: layers).order(:id).map { |feature| serialize(feature) }
      end

      def serialize(feature)
        properties = {
          "id" => feature.id, "layer" => feature.layer, "kind" => feature.kind,
          "name" => (feature.name unless zone?(feature) && !@options["show_zone_names"]), "style" => feature.style
        }
        properties.merge!(feature.properties.to_h.slice(*EARTHWORK_PROPERTIES)) if EARTHWORK_KINDS.include?(feature.kind)
        properties["notes"] = feature.notes if @options["show_notes"]
        { "type" => "Feature", "id" => feature.id, "geometry" => feature.geometry_geojson, "properties" => properties }
      end

      # How the published plants grow (Relief::GrowingPlants), for the year
      # slider, the plants' numbered pastilles and the link preview: only the
      # plants and patches the snapshot shows, without their own names.
      def growth
        ids = features.map { |feature| feature["id"] }.to_set
        data = Relief::GrowingPlants.new(@map).as_json
        plants = data[:plants].select { |plant| ids.include?(plant[:id]) }.map { |plant| plant.except(:ownName) }
        patches = data[:patches].select { |patch| ids.include?(patch[:id]) }.map { |patch| patch.except(:name) }
        return nil if plants.empty? && patches.empty?
        { "today" => data[:today], "origin" => data[:origin], "plants" => plants, "patches" => patches }.deep_stringify_keys
      end

      # A named zone or path drawn with the « Zone » tool: its name often
      # carries the designer's notes, so it stays private unless shown.
      def zone?(feature) = feature.kind == "zone" || (feature.kind == "line" && feature.layer == "notes")

      def region_layer_keys
        scope = @map.region.catalogue.enabled.where(key: @options["region_layers"])
        scope = scope.reject { |layer| self.class.sensitive_region_layer?(layer) } if @options["hide_networks"]
        scope.map(&:key)
      end
  end
end
