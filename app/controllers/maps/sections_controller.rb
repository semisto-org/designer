# « Coupe dans le temps »: the section along a line the person draws
# (Relief::Section), for the editor's panel. Anyone on the map reads it.
module Maps
  class SectionsController < ApplicationController
    include MapScoped

    before_action :set_map

    # GET /maps/:map_id/design/section?line=lng,lat;lng,lat[&corridor=6]
    def show
      line = params[:line].to_s.split(";").map { |pair| pair.split(",") }
      section = Relief::Section.new(@map, line:, corridor_m: params[:corridor].presence || Relief::Section::CORRIDOR_M)
      render json: section.as_json
    rescue Relief::Section::Error => error
      render json: { message: error.message, code: error.key }, status: :unprocessable_content
    end
  end
end
