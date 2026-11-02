module PublicMaps
  # The simplified 3D view of a published map (GET /p/:token/3d): the
  # terrain's relief with the published elements and plants, to see the rain
  # run, the cold air settle at night, the shade turn, and to walk or drive
  # across. The relief is the ground's (public elevation data); everything
  # drawn on it comes from the snapshot, never from the live map.
  class ReliefsController < ApplicationController
    include PublicMeta
    include EmbeddablePublicView
    allow_unauthenticated_access

    before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }
    before_action :set_publication

    def show
      terrain = @map.terrain
      render inertia: "public_maps/relief", props: {
        title: @publication.title,
        path: @publication.public_path,
        boundary: @publication.snapshot.dig("map", "boundary"),
        terrain: terrain.as_grid(url_for: ->(kind) { public_map_relief_file_path(@publication.token, kind, v: terrain.version) }),
        features: @publication.features,
        growingPlants: growing_plants,
        timezone: @map.region.setting(:relief, :timezone) || Time.zone.tzinfo.name,
        location: @publication.snapshot.dig("map", "center"),
        landcoverClasses: @map.region.setting(:relief, :landcover_classes) || {},
        soilModel: soil_model,
        buildingsUrl: Providers::Buildings.build.available? ? public_map_relief_buildings_path(@publication.token, v: terrain.version) : nil
      }, meta: meta_tags(title: @publication.title, description: t("public_maps.relief.meta"))
    end

    def file
      attachment = @map.terrain.file(params[:kind])
      return head :not_found unless attachment

      response.set_header("Cache-Control", "public, max-age=86400")
      send_data attachment.download, type: Maps::ReliefsController::CONTENT_TYPES.fetch(params[:kind]), disposition: "inline",
                                     filename: attachment.filename.to_s
    end

    def buildings
      provider = Providers::Buildings.build
      buildings = provider.within(**@map.terrain.bounds)
      response.set_header("Cache-Control", "public, max-age=86400")
      render json: { available: true, attribution: provider.attribution, buildings: buildings.map(&:as_json) }
    rescue Providers::Buildings::Unavailable
      render json: { available: false, attribution: nil, buildings: [] }
    end

    private
      def set_publication
        @publication = MapPublication.includes(:map).find_by!(token: params[:token])
        @map = @publication.map
        return head(:gone) unless @publication.live?
        head :not_found unless @publication.relief?
      end

      # The snapshot's growth data, as the 3D view reads it (no own names).
      def growing_plants
        growth = @publication.snapshot["growth"] || {}
        today = Date.current.iso8601
        {
          today:, origin: growth["origin"] || today,
          plants: Array(growth["plants"]).map { |plant| plant.merge("ownName" => nil) },
          patches: Array(growth["patches"]).map { |patch| patch.merge("name" => nil) }
        }
      end

      # How the soil drinks: the map's water settings, without the
      # positions of its infiltration tests.
      def soil_model
        settings = @map.effective_water_settings
        { soil: settings["soil"], uniformRate: settings["uniform_rate_mm_h"].to_f, storage: settings["storage_mm"].to_f,
          rateFactor: settings["rate_factor"].to_f, storageFactor: settings["storage_factor"].to_f,
          percolation: settings["percolation_mm_h"].to_f, measurements: [] }
      end
  end
end
