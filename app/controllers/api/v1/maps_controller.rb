# The phone app's map list and, for one map, everything it keeps offline:
# the map, its layer catalogue, features, photos and planting.
module Api
  module V1
    class MapsController < BaseController
      include MapScoped

      before_action :set_map, only: %i[show style]

      # Labels of the app's own layers (feature names) need glyphs; the
      # « plan » base map already uses OpenFreeMap.
      GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf".freeze

      def index
        maps = Map.active.where(id: Current.user.map_memberships.select(:map_id))
          .or(Map.active.where(organization_id: Current.user.organization_memberships.select(:organization_id)))
          .includes(:region, :owner).order(updated_at: :desc)
        render json: { maps: maps.map { |m| m.as_inertia(Current.user).merge(readOnlyByPlan: m.read_only_by_plan?) } }
      end

      def show
        render json: {
          map: @map.as_inertia(Current.user).merge(readOnlyByPlan: @map.read_only_by_plan?),
          mapEntitlements: map_entitlements.as_json,
          layers: @map.region.catalogue.enabled.map(&:as_inertia),
          features: @map.features.where.not(status: "rejected").map(&:as_geojson),
          photos: @map.photos.includes(:uploaded_by, image_attachment: :blob).chronological.limit(2000).map(&:as_inertia),
          planting: PlantingState.new(@map),
          # Dated drone views, newest first, to lay over the base map (style ?drone=id).
          aerialViews: @map.aerial_views.ready.newest_first.map { aerial_view_json(_1) },
          syncedAt: Time.current.iso8601
        }
      end

      # A MapLibre style for one base map of the map's region (?base=key,
      # else the region's default), so the phone can show it and download
      # it as an offline pack. A base that is itself a style is that style.
      # ?drone=id lays one of the map's drone views over it; a drone view
      # cannot go over a whole style, so it then goes over the region's first
      # tiled base (the land still shows around the flight).
      def style
        view = params[:drone].presence && @map.aerial_views.ready.find_by(id: params[:drone])
        bases = @map.region.catalogue.enabled.select { |layer| layer.category == "base" }
        base = bases.find { |layer| layer.key == params[:base] } || bases.find(&:default?) || bases.first
        base = bases.find { _1.kind != "style" } if view && base&.kind == "style"
        return head :not_found unless base || view
        return redirect_to(base.tile_url, allow_other_host: true) if base&.kind == "style"

        sources = {}
        layers = [ { id: "background", type: "background", paint: { "background-color" => "#f3efe6" } } ]
        if base
          tiles = base.tile_url.start_with?("/") ? "#{request.base_url}#{base.tile_url}" : base.tile_url
          sources["base"] = { type: "raster", tiles: [ tiles ], tileSize: base.tile_size,
                              minzoom: base.min_zoom || 0, maxzoom: base.max_zoom || 22, attribution: base.attribution }.compact
          layers << { id: "base", type: "raster", source: "base" }
        end
        if view
          sources["drone"] = drone_source(view)
          layers << { id: "drone", type: "raster", source: "drone" }
        end
        render json: { version: 8, name: view&.name || base.name, glyphs: GLYPHS, sources:, layers: }
      end

      private
        def aerial_view_json(view)
          { id: view.id, name: view.name, capturedOn: view.captured_on.iso8601, attribution: view.attribution,
            minZoom: view.min_zoom, maxZoom: view.max_zoom, bounds: view.bounds }
        end

        # An xyz view's own tiles; a PMTiles archive's tiles cut out by AerialTilesController.
        def drone_source(view)
          tiles = view.kind == "xyz" ? view.url : "#{api_v1_map_aerial_tile_url(@map, view.id, 0, 0, 0).delete_suffix('/0/0/0')}/{z}/{x}/{y}"
          bounds = view.bounds && %w[west south east north].map { view.bounds[_1] }
          { type: "raster", tiles: [ tiles ], tileSize: 256, minzoom: view.min_zoom || 0, maxzoom: view.max_zoom || 22,
            attribution: view.attribution, bounds: bounds&.all?(Numeric) ? bounds : nil }.compact
        end
    end
  end
end
