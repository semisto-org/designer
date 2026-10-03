# The tile relay: GET /regions/:region_id/layers/:key/tiles/:z/:x/:y
#
# Public (public map views need it too) but narrow: only enabled, proxied
# raster layers of the catalogue, only inside the region's bounds and the
# layer's zoom range, only towards allow-listed hosts, rate limited per IP.
# Upstream failures answer 502 (MapLibre reports them, the "Couches" panel
# shows the layer as unreachable); out-of-range tiles answer 404 (silent).
class RegionLayerTilesController < ApplicationController
  allow_unauthenticated_access
  rate_limit to: 1200, within: 1.minute, by: -> { request.remote_ip }, with: -> { head :too_many_requests }

  BROWSER_TTL = 7.days

  def show
    layer = Region.find(params[:region_id]).layers.enabled.find_by!(key: params[:key], proxied: true)
    z, x, y = params.values_at(:z, :x, :y).map(&:to_i)
    etag = "#{layer.id}-#{layer.cache_version}-#{z}-#{x}-#{y}"
    return unless stale?(etag:, public: true, template: false)

    tile = Providers::TileRelay.new(layer).fetch(z, x, y)
    expires_in BROWSER_TTL, public: true
    send_data tile.body, type: tile.content_type, disposition: "inline"
  rescue ActiveRecord::RecordNotFound, Providers::TileRelay::OutOfRange
    head :not_found
  rescue Providers::GeoHttp::Forbidden => error
    Rails.logger.warn("[tiles] #{error.message}")
    head :forbidden
  rescue Providers::GeoHttp::Unavailable => error
    Rails.logger.info("[tiles] #{params[:key]} #{z}/#{x}/#{y}: #{error.message}")
    no_store
    head :bad_gateway
  end
end
