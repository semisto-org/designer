# POST /maps/:map_id/boundary_import (multipart `file`): the terrain
# outline from a GeoJSON or KML file.
module Maps
  class BoundaryImportsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!

    def create
      map = Boundaries::FileImport.new(@map, params[:file]).call
      render json: { map: map.as_inertia(Current.user) }
    rescue Boundaries::FileImport::Error => error
      render json: { message: error.message }, status: :unprocessable_entity
    end
  end
end
