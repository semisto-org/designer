module PublicMaps
  # The drone view the owner chose to show on a public view, when it was
  # imported from a file: redirects to a short-lived link to its PMTiles
  # archive (the browser reads it by byte ranges, and keeps the redirect
  # for a few minutes). Only while the view is published.
  class AerialViewsController < ApplicationController
    include ActiveStorage::SetCurrent
    allow_unauthenticated_access

    LINK_LIFETIME = 10.minutes

    def show
      publication = MapPublication.includes(:map).find_by!(token: params[:token])
      return head :gone unless publication.live?
      view = publication.aerial_view
      return head :not_found unless view&.archive&.attached?
      expires_in LINK_LIFETIME - 1.minute, public: true
      redirect_to stored_file_url(view.archive, expires_in: LINK_LIFETIME), allow_other_host: true
    end
  end
end
