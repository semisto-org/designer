module PublicMaps
  # Tiles of the region layers shown in a public view, fetched server side
  # (the provider's URL never reaches the visitor). Only the layers the
  # owner published, only while the view is published.
  class TilesController < ApplicationController
    allow_unauthenticated_access
    # A map page asks for a few dozen tiles at once; this only stops abuse of the proxy.
    rate_limit to: 900, within: 1.minute, with: -> { head :too_many_requests }

    def show
      publication = MapPublication.includes(:map).find_by!(token: params[:token])
      return head :gone unless publication.live?
      layer = publication.region_layer(params[:layer_key]) or return head :not_found
      z, x, y = params.values_at(:z, :x, :y).map { |v| Integer(v, exception: false) }
      return head :bad_request unless z && x && y && z.between?(0, 22) && x.between?(0, 2**z - 1) && y.between?(0, 2**z - 1)

      tile = Collab::TileProxy.new(layer).fetch(z, x, y)
      return head :bad_gateway unless tile

      expires_in 12.hours, public: true
      send_data tile.body, type: tile.content_type, disposition: "inline"
    end
  end
end
