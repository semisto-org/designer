# JSON for the « Stations météo proches » section of the « Climat » panel:
# the official stations nearest to the map and the last days they measured
# (`show`, `?station=CODE` for a station chosen on the map), and every
# station of the region's provider as GeoJSON for the map overlay
# (`stations`).
module Maps
  class WeatherStationsController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: WeatherStations::MapReport.new(@map, station: params[:station]).as_json
    end

    def stations
      render json: WeatherStations::MapReport.new(@map).stations_geojson
    end
  end
end
