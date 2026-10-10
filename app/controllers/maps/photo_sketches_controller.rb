# Sketches over a map photo: JSON API of the photo sketcher. Everyone on the
# map sees them; editors draw, rename and delete them.
module Maps
  class PhotoSketchesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_photo
    before_action :set_sketch, only: %i[update destroy]

    def index
      render json: { sketches: @photo.sketches.includes(:created_by).map(&:as_inertia) }
    end

    def create
      sketch = @photo.sketches.new(sketch_params.merge(map: @map, created_by: Current.user))
      sketch.name = t("photo_sketches.default_name", number: @photo.sketches.count + 1) if sketch.name.blank?
      if sketch.save
        render json: sketch.as_inertia, status: :created
      else
        render_errors sketch
      end
    end

    def update
      if @sketch.update(sketch_params)
        render json: @sketch.as_inertia
      else
        render_errors @sketch
      end
    rescue ActiveRecord::StaleObjectError
      render json: { message: t("photo_sketches.errors.stale"), sketch: @sketch.reload.as_inertia }, status: :conflict
    end

    def destroy
      @sketch.destroy!
      head :no_content
    end

    private
      def set_photo
        @photo = @map.photos.find(params[:photo_id])
      end

      def set_sketch
        @sketch = @photo.sketches.find(params[:id])
      end

      # Strokes are read from the JSON body as sent (numbers stay numbers);
      # PhotoSketch checks every mark.
      def sketch_params
        permitted = params.require(:sketch).permit(:name, :lock_version).to_h
        raw = request.request_parameters["sketch"]
        permitted[:strokes] = raw["strokes"] if raw.is_a?(Hash) && raw.key?("strokes")
        permitted
      end

      def render_errors(sketch)
        render json: { message: sketch.errors.full_messages.to_sentence, errors: sketch.errors.to_hash(true) }, status: :unprocessable_entity
      end
  end
end
