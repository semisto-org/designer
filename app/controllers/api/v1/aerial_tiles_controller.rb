# One tile of a map's drone view, for the phone app (GET
# /api/v1/maps/:map_id/aerial_views/:id/tiles/:z/:x/:y). The website reads a
# view's PMTiles archive itself with range requests; the phone's map engine
# cannot (our token goes only to our own API, and a signed file link dies in
# minutes, mid-walk), so the tile is cut out of the archive here, wherever
# it lies: the map's files for an imported view, Semisto's host for a view
# staff set up by its address. Views of kind "xyz" need none of this: the
# style points at their tiles directly.
module Api
  module V1
    class AerialTilesController < BaseController
      include MapScoped

      before_action :set_map

      FETCH_TIMEOUT = 10

      def show
        view = @map.aerial_views.ready.where(kind: "pmtiles").find(params[:aerial_view_id])
        tile = reader(view).tile(params[:z].to_i, params[:x].to_i, params[:y].to_i)
        return head :no_content unless tile

        bytes, type = tile
        # A view never changes once ready: the phone may keep the tile.
        expires_in 30.days, public: false
        send_data bytes, type:, disposition: :inline
      rescue AerialViews::PmtilesReader::Unreadable, Faraday::Error, ActiveStorage::FileNotFoundError => error
        Rails.logger.warn("[drone] no tile for view #{params[:aerial_view_id]}: #{error.class}: #{error.message}")
        head :bad_gateway
      end

      private
        def reader(view)
          if view.archive.attached?
            blob = view.archive.blob
            AerialViews::PmtilesReader.new(cache_key: "blob-#{blob.key}") do |offset, length|
              blob.service.download_chunk(blob.key, offset...(offset + length))
            end
          else
            AerialViews::PmtilesReader.new(cache_key: "url-#{Digest::SHA256.hexdigest(view.url)}") do |offset, length|
              remote_range(view.url, offset, length)
            end
          end
        end

        def remote_range(url, offset, length)
          response = Faraday.new(request: { timeout: FETCH_TIMEOUT, open_timeout: 5 }) { _1.response :raise_error }
            .get(url, nil, { "Range" => "bytes=#{offset}-#{offset + length - 1}" })
          # A host that ignores Range sends the whole file: keep the part asked for.
          response.status == 206 ? response.body : response.body.to_s.b.byteslice(offset, length)
        end
    end
  end
end
