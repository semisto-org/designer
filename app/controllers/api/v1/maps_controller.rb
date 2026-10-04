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
          syncedAt: Time.current.iso8601
        }
      end

      # A MapLibre style for one base map of the map's region (?base=key,
      # else the region's default), so the phone can show it and download
      # it as an offline pack. A base that is itself a style is that style.
      def style
        bases = @map.region.catalogue.enabled.select { |layer| layer.category == "base" }
        base = bases.find { |layer| layer.key == params[:base] } || bases.find(&:default?) || bases.first
        return head :not_found unless base
        return redirect_to(base.tile_url, allow_other_host: true) if base.kind == "style"

        tiles = base.tile_url.start_with?("/") ? "#{request.base_url}#{base.tile_url}" : base.tile_url
        render json: {
          version: 8, name: base.name, glyphs: GLYPHS,
          sources: {
            "base" => { type: "raster", tiles: [ tiles ], tileSize: base.tile_size,
                        minzoom: base.min_zoom || 0, maxzoom: base.max_zoom || 22, attribution: base.attribution }.compact
          },
          layers: [
            { id: "background", type: "background", paint: { "background-color" => "#f3efe6" } },
            { id: "base", type: "raster", source: "base" }
          ]
        }
      end
    end
  end
end
