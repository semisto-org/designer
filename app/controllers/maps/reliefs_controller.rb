# The 3D relief of a map, with rain, runoff and sun (full-screen page), and
# its rasters, read by the browser as typed arrays. All analyses run in the
# browser; nothing but the page and the files comes from here.
module Maps
  class ReliefsController < ApplicationController
    include MapScoped
    include ReliefGate

    # The files change only with a new import, and their URL carries its
    # version (`?v=`): a year of private cache is safe.
    CACHE_CONTROL = "private, max-age=31536000, immutable".freeze
    CONTENT_TYPES = { "grid" => "application/octet-stream", "surface" => "application/octet-stream",
                      "landcover" => "application/octet-stream", "texture" => "image/jpeg" }.freeze

    before_action :set_map
    before_action :require_analyses!

    def show
      terrain = @map.terrain
      render inertia: "maps/reliefs/show", props: {
        map: @map.as_inertia(Current.user),
        terrain: terrain&.ready? ? terrain.as_grid(url_for: ->(kind) { file_map_relief_path(@map, kind, v: terrain.version) }) : nil,
        overview: Relief::Overview.new(@map).as_json,
        features: @map.features.where.not(status: "rejected").map(&:as_geojson),
        timezone: @map.region.setting(:relief, :timezone) || Time.zone.tzinfo.name,
        location: location,
        landcoverClasses: @map.region.setting(:relief, :landcover_classes) || {},
        soilModel: soil_model,
        canEdit: @map.editable_by?(Current.user)
      }
    end

    def file
      attachment = @map.terrain&.ready? && @map.terrain.file(params[:kind])
      return head :not_found unless attachment

      response.set_header("Cache-Control", CACHE_CONTROL)
      send_data attachment.download, type: CONTENT_TYPES.fetch(params[:kind]), disposition: "inline",
                                     filename: attachment.filename.to_s
    end

    private
      def soil_model
        settings = @map.effective_water_settings
        { soil: settings["soil"], uniformRate: settings["uniform_rate_mm_h"].to_f, storage: settings["storage_mm"].to_f,
          rateFactor: settings["rate_factor"].to_f, storageFactor: settings["storage_factor"].to_f,
          percolation: settings["percolation_mm_h"].to_f }
      end

      # Where the sun is computed: the boundary's centroid, else the map's
      # centre, else the region's.
      def location
        point = @map.boundary&.centroid || @map.center || @map.region.center
        point && [ point.x, point.y ]
      end
  end
end
