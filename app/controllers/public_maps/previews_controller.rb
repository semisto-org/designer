module PublicMaps
  # The link preview of a public view (og:image): the garden in year 15,
  # painted when the map was published. Served as the image itself, not a
  # redirect, as some link-preview crawlers do not follow one.
  class PreviewsController < ApplicationController
    allow_unauthenticated_access

    def show
      publication = MapPublication.find_by!(token: params[:token])
      return head :gone unless publication.live?
      return head :not_found unless publication.preview_image.attached?
      expires_in 1.hour, public: true
      send_data publication.preview_image.download, type: "image/png", disposition: "inline", filename: "#{publication.token}.png"
    end
  end
end
