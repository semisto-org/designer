# The checklists of the map's journey and its next best action (JSON, read by
# the editor's journey panel). `seen` carries the flags only the browser knows.
module Maps
  class JourneysController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: Journey.new(@map, seen: params[:seen])
    end
  end
end
