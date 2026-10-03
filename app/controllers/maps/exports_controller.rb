# GeoJSON download of a map. Networks only for editors who ask for them.
module Maps
  class ExportsController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      export = MapGeojsonExport.new(@map, include_networks: params[:networks] == "1" && %w[owner editor].include?(@role))
      send_data export.to_json, type: "application/geo+json", filename: export.filename, disposition: "attachment"
    end
  end
end
