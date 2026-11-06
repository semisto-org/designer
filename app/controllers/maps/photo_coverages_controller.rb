# JSON for the timeline of aerial photos in « Couches »: the partial flights
# (half of Wallonia, the IGN's historical mosaics) that have no photo over
# this map, so the timeline greys them out instead of showing a blank map.
module Maps
  class PhotoCoveragesController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: { uncovered: PhotoArchive::Coverage.uncovered(@map) }
    end
  end
end
