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
        growingPlants: Relief::GrowingPlants.new(@map).as_json,
        timezone: @map.region.setting(:relief, :timezone) || Time.zone.tzinfo.name,
        location: location,
        landcoverClasses: @map.region.setting(:relief, :landcover_classes) || {},
        soilModel: soil_model,
        buildingsUrl: terrain&.ready? && Providers::Buildings.build.available? ? buildings_map_relief_path(@map, v: terrain.version) : nil,
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

    # The building footprints over the terrain's extent (OpenStreetMap), for
    # extruded volumes in 3D. A provider that fails answers an empty list:
    # the relief stays usable without them.
    def buildings
      bounds = @map.terrain&.ready? && @map.terrain.bounds
      return head :not_found unless bounds

      provider = Providers::Buildings.build
      buildings = provider.within(**bounds)
      response.set_header("Cache-Control", "private, max-age=86400")
      render json: { available: true, attribution: provider.attribution, buildings: buildings.map(&:as_json) }
    rescue Providers::Buildings::Unavailable
      render json: { available: false, attribution: nil, buildings: [] }
    end

    # The contour line through a point (« Suivre la courbe » in the drawing
    # toolbar): GeoJSON, altitude and length, or why none can be traced.
    def contour
      lng = Float(params[:lng], exception: false)
      lat = Float(params[:lat], exception: false)
      return head :bad_request unless lng && lat

      render json: Relief::Contour.new(@map, lng:, lat:).call.as_json
    rescue Relief::Contour::Error => e
      render json: { message: e.message, reason: e.key }, status: :unprocessable_entity
    end

    # The catchment of a pond, swale or rain garden (`feature_id`) or of a
    # point (`lng`, `lat`): outline, area, capacity, rain that fills it.
    def catchment
      catchment =
        if params[:feature_id].present?
          Relief::Catchment.new(@map, feature: @map.features.find(params[:feature_id]))
        else
          lng = Float(params[:lng], exception: false)
          lat = Float(params[:lat], exception: false)
          return head :bad_request unless lng && lat

          Relief::Catchment.new(@map, lng:, lat:)
        end
      render json: catchment.call.as_json
    rescue Relief::Catchment::Error => e
      render json: { message: e.message, reason: e.key }, status: :unprocessable_entity
    end

    # The keypoints of the terrain's valleys, each with its keyline.
    def keypoints
      render json: Relief::Keypoints.new(@map).call.as_json
    rescue Relief::Keypoints::Error => e
      render json: { message: e.message, reason: e.key }, status: :unprocessable_entity
    end

    # Lines parallel to a keyline (`feature_id`), every `spacing_m` metres,
    # `above` and `below` it.
    def parallels
      feature = @map.features.where.not(status: "rejected").find(params[:feature_id])
      lines = Relief::Parallels.new(@map, feature:, spacing_m: params[:spacing_m], above: params[:above], below: params[:below]).call
      render json: { lines: lines.map(&:as_json) }
    rescue Relief::Parallels::Error => e
      render json: { message: e.message, reason: e.key }, status: :unprocessable_entity
    end

    # What the relief says about an observation made during a downpour
    # (`feature_id`), and the rain the nearest station measured that day.
    def storm
      feature = @map.features.where.not(status: "rejected").find(params[:feature_id])
      relief =
        begin
          Relief::StormCheck.new(@map, feature:).call.as_json.merge(available: true)
        rescue Relief::StormCheck::Error => e
          { available: false, reason: e.key, message: e.message }
        end
      return render(json: relief.slice(:message, :reason), status: :unprocessable_entity) if relief[:reason] == :not_storm

      date = feature.observed_at&.in_time_zone&.to_date
      rain = date ? WeatherStations::MapReport.new(@map).rain_on(date) : { "available" => false, "reason" => "no_data" }
      render json: { relief:, rain: }
    end

    private
      def soil_model
        settings = @map.effective_water_settings
        { soil: settings["soil"], uniformRate: settings["uniform_rate_mm_h"].to_f, storage: settings["storage_mm"].to_f,
          rateFactor: settings["rate_factor"].to_f, storageFactor: settings["storage_factor"].to_f,
          percolation: settings["percolation_mm_h"].to_f, measurements: @map.infiltration_measurements }
      end

      # Where the sun is computed: the boundary's centroid, else the map's
      # centre, else the region's.
      def location
        point = @map.boundary&.centroid || @map.center || @map.region.center
        point && [ point.x, point.y ]
      end
  end
end
