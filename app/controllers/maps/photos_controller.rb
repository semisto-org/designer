# Photos of a map: JSON API of the editor's « Photos » panel. Viewers read,
# editors upload and edit. Files never leave through a public URL: `image`
# checks the role on the map, then redirects to a short-lived link.
module Maps
  class PhotosController < ApplicationController
    include MapScoped
    include ActiveStorage::SetCurrent

    before_action :set_map
    before_action :require_editor!, except: %i[index same_spot image]
    before_action :set_photo, only: %i[update destroy same_spot image]

    IMAGE_SIZES = %w[thumb large original].freeze
    LINK_LIFETIME = 5.minutes

    def index
      scope = @map.photos.includes(:uploaded_by, image_attachment: :blob)
      if params[:feature_id].present?
        feature = @map.features.find(params[:feature_id])
        scope = MapPhoto.around_feature(feature).includes(:uploaded_by, image_attachment: :blob)
          .order(Arel.sql("(map_photos.map_feature_id = #{feature.id.to_i}) DESC NULLS LAST, distance_m ASC NULLS LAST"))
        return render json: { photos: scope.map(&:as_inertia) }
      end
      scope = scope.where(photo_album_id: params[:album_id]) if params[:album_id].present?
      scope = scope.unlocated if params[:unplaced].present?
      render json: {
        photos: scope.chronological.limit(2000).map(&:as_inertia),
        albums: albums_json,
        limits: { maxBytes: MapPhoto::MAX_BYTES, contentTypes: MapPhoto::UPLOAD_TYPES }
      }
    end

    def create
      photo = @map.photos.new(photo_params.merge(uploaded_by: Current.user))
      if photo.save
        render json: photo.as_inertia, status: :created
      else
        render_photo_errors photo
      end
    rescue ActiveRecord::RecordNotUnique
      render json: { message: t("soil_photos.errors.already_imported", name: photo.image.blob.filename.to_s), code: "duplicate" }, status: :unprocessable_entity
    end

    def update
      if @photo.update(photo_params)
        render json: @photo.as_inertia
      else
        render_photo_errors @photo
      end
    end

    def destroy
      @photo.destroy!
      head :no_content
    end

    # Other photos of the same spot, for the before/after comparison.
    def same_spot
      render json: { photos: @photo.same_spot.map(&:as_inertia) }
    end

    # /maps/:map_id/photos/:id/image?size=thumb|large|original[&download=1]
    def image
      size = params[:size].presence_in(IMAGE_SIZES) || "large"
      # The original keeps its EXIF block, GPS included: only editors get it.
      size = "large" if size == "original" && !editor?
      attachment = @photo.image
      return head :not_found unless attachment.attached?
      target = size == "original" ? attachment : attachment.variant(size.to_sym).processed
      redirect_to storage_link(target, download: params[:download].present?), allow_other_host: true
    rescue StandardError => error
      # A file libvips cannot read still has its original.
      Rails.logger.warn("[photos] no #{params[:size]} variant for photo #{@photo.id}: #{error.class}: #{error.message}")
      return head :not_found unless editor?
      redirect_to storage_link(@photo.image, download: false), allow_other_host: true
    end

    private
      def editor? = %w[owner editor].include?(@role)

      def set_photo
        @photo = @map.photos.find(params[:id])
      end

      def storage_link(target, download:)
        expires_in LINK_LIFETIME - 1.minute, private: true
        target.url(expires_in: LINK_LIFETIME, disposition: download ? :attachment : :inline)
      end

      def albums_json
        counts = @map.photos.group(:photo_album_id).count
        @map.photo_albums.ordered.map { |album| album.as_inertia(photos_count: counts[album.id].to_i) }
      end

      # Position arrives as lng/lat (read from the EXIF block by the browser, or
      # clicked on the map); empty values clear it.
      def photo_params
        raw = params.require(:photo).permit(:image, :caption, :taken_at, :heading, :photo_album_id, :map_feature_id, :source, :location_source, :lng, :lat)
        if raw.key?(:lng) || raw.key?(:lat)
          raw[:location] = MapPhoto.point_from(raw[:lng], raw[:lat])
        end
        raw.except(:lng, :lat)
      end

      def render_photo_errors(photo)
        duplicate = photo.errors.of_kind?(:base, :already_imported)
        render json: {
          message: photo.errors.full_messages.to_sentence, errors: photo.errors.to_hash(true),
          code: duplicate ? "duplicate" : "invalid"
        }, status: :unprocessable_entity
      end
  end
end
