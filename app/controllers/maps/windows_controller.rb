# « Fenêtre sur l'an 15 »: on the land, the phone's camera (or a photo taken
# there) with the design's plants painted in, grown to year 5, 15 or 30.
# Everything is drawn in the browser from the relief grids the 3D view
# already serves (Maps::ReliefsController#file) and the plants' growth
# (Relief::GrowingPlants); nothing but the page comes from here. Opened
# from the 3D view, a photo, or with `lng`, `lat` and `heading` (the MCP's
# get_view_from_point gives that link).
module Maps
  class WindowsController < ApplicationController
    include MapScoped

    # The located photos offered to look through, newest first.
    PHOTO_LIMIT = 200

    before_action :set_map

    def show
      terrain = @map.terrain
      ready = terrain&.ready?
      render inertia: "maps/windows/show", props: {
        map: @map.as_inertia(Current.user),
        terrain: ready ? terrain.as_grid(url_for: ->(kind) { file_map_relief_path(@map, kind, v: terrain.version) }) : nil,
        growingPlants: ready ? Relief::GrowingPlants.new(@map).as_json : nil,
        photos: ready ? located_photos : [],
        start: start,
        timezone: @map.region.setting(:relief, :timezone) || Time.zone.tzinfo.name,
        canEdit: @map.editable_by?(Current.user)
      }
    end

    private
      def located_photos
        @map.photos.images.located.includes(image_attachment: :blob).chronological.limit(PHOTO_LIMIT).map do |photo|
          data = photo.as_inertia
          data.slice(:id, :caption, :takenAt, :lng, :lat, :heading, :width, :height)
              .merge(focal35: photo.camera&.dig("focal_length_35mm"))
        end
      end

      # Where to open: a photo of the map, or a point and a heading.
      def start
        photo_id = Integer(params[:photo_id], exception: false)
        lng = Float(params[:lng], exception: false)
        lat = Float(params[:lat], exception: false)
        heading = Float(params[:heading], exception: false)
        year = Integer(params[:year], exception: false)
        {
          photoId: photo_id,
          point: lng && lat && lng.between?(-180, 180) && lat.between?(-90, 90) ? [ lng, lat ] : nil,
          heading: heading && heading % 360,
          year: year&.clamp(0, 30)
        }
      end
  end
end
