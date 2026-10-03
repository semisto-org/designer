# Address search for the "Nouvelle carte" form and the editor:
# GET /geocode?q=&region_id=  → { available:, results: [{ label, detail, lng, lat, bbox, zoom }] }
class GeocodingController < ApplicationController
  rate_limit to: 30, within: 1.minute, by: -> { Current.user&.id },
    with: -> { render json: { message: t("map_data.geocode.rate_limited") }, status: :too_many_requests }

  def index
    geocoder = Providers::Geocoder.build
    return render json: { available: false, results: [] } unless geocoder.available?

    region = Region.active.find_by(id: params[:region_id]) || Region.default
    results = geocoder.search(params[:q], region:)
    render json: { available: true, results: results.map(&:as_json) }
  rescue Providers::Geocoder::Unavailable => error
    Rails.logger.info("[geocode] #{error.message}")
    render json: { available: true, message: t("map_data.geocode.unavailable"), results: [] }, status: :service_unavailable
  end
end
