# Which region a place belongs to, for the "Nouvelle carte" preview:
# GET /regions/locate?lng=&lat= → { region:, layers: [base maps] }
class RegionsController < ApplicationController
  def locate
    region = Region.for_point(Float(params[:lng]), Float(params[:lat]))
    render json: { region: region.as_inertia, layers: PhotoArchive.preview_bases(region).map(&:as_inertia) }
  rescue ArgumentError, TypeError
    render json: { message: t("map_data.locate.invalid") }, status: :unprocessable_entity
  end
end
