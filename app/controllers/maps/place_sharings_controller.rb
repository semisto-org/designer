module Maps
  # The choices only the owners of the place make (« Le lieu »): show the
  # plants in the ground to other gardeners, and accept their requests for
  # scions, cuttings or seeds (MapPlaceOwners). Answers with the « Partager »
  # dialog's data.
  class PlaceSharingsController < ApplicationController
    include MapScoped

    before_action :set_map

    def update
      unless @map.place_owner?(Current.user)
        return render json: { message: t("propagation.errors.place_owners_only") }, status: :forbidden
      end

      @map.update!(params.require(:place_sharing).permit(:shares_planted_palette, :accepts_propagation_requests))
      render json: Collab::SharingPayload.new(@map, Current.user, url_helpers: self)
    end
  end
end
