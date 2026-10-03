module Maps
  # The sharing dialog's data: who is on the map, with which role.
  class SharingsController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: Collab::SharingPayload.new(@map, Current.user, url_helpers: self)
    end
  end
end
