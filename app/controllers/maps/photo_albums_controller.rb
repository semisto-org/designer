module Maps
  class PhotoAlbumsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!
    before_action :set_album, only: %i[update destroy]

    def create
      album = @map.photo_albums.new(album_params.merge(position: @map.photo_albums.maximum(:position).to_i + 1))
      album.save ? render(json: album.as_inertia(photos_count: 0), status: :created) : render_errors(album)
    end

    def update
      @album.update(album_params) ? render(json: @album.as_inertia) : render_errors(@album)
    end

    # The photos stay on the map, they just leave the album.
    def destroy
      @album.destroy!
      head :no_content
    end

    private
      def set_album
        @album = @map.photo_albums.find(params[:id])
      end

      def album_params
        params.require(:photo_album).permit(:name, :description)
      end
  end
end
