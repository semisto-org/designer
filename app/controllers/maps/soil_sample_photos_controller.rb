# The photos of a soil sampling point (the hole, the core, the profile).
# `show` lists the map's photos a person can link to the point: those
# already linked first, then the closest to it, then the newest; `update`
# sets the linked photos to exactly the ones chosen. New photos are sent
# through Maps::PhotosController#create with `soil_sample_id`.
module Maps
  class SoilSamplePhotosController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :show
    before_action :set_sample

    MAX_CANDIDATES = 300
    MAX_LINKED = 100

    def show
      scope = @map.photos.includes(:uploaded_by, image_attachment: :blob)
      if @sample.location
        distance = MapPhoto.sanitize_sql_array([
          "CASE WHEN map_photos.location IS NULL THEN NULL ELSE ST_Distance(map_photos.location::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) END AS distance_m",
          @sample.lng, @sample.lat
        ])
        scope = scope.select("map_photos.*", distance)
      end
      linked_first = MapPhoto.sanitize_sql_array([ "(map_photos.soil_sample_id = ?) DESC NULLS LAST", @sample.id ])
      order = [ linked_first ]
      order << "distance_m ASC NULLS LAST" if @sample.location
      order << "COALESCE(map_photos.taken_at, map_photos.created_at) DESC" << "map_photos.id DESC"
      photos = scope.order(Arel.sql(order.join(", "))).limit(MAX_CANDIDATES)
      render json: { photos: photos.map(&:as_inertia) }
    end

    # { photo_ids: [1, 2, 3] }: the point's photos are these, and only these.
    def update
      ids = Array(params[:photo_ids]).map(&:to_i).uniq.first(MAX_LINKED)
      chosen = @map.photos.where(id: ids).ids
      MapPhoto.transaction do
        @map.photos.where(soil_sample_id: @sample.id).where.not(id: chosen).update_all(soil_sample_id: nil, updated_at: Time.current)
        @map.photos.where(id: chosen).update_all(soil_sample_id: @sample.id, updated_at: Time.current)
      end
      render json: @map.soil_samples.with_attached_lab_reports.with_photos.find(@sample.id).as_inertia(analyses: map_entitlements.analyses?)
    end

    private
      def set_sample
        @sample = @map.soil_samples.find(params[:soil_sample_id])
      end
  end
end
