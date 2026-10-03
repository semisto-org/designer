# The public, read-only view of a map: GET /p/:token, no account needed.
# It serves the snapshot taken at publication, never the live map.
class PublicMapsController < ApplicationController
  allow_unauthenticated_access
  before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }

  def show
    publication = MapPublication.includes(:map).find_by!(token: params[:token])
    if publication.live?
      render inertia: "public_maps/show", props: publication.as_public
    else
      render inertia: "public_maps/gone", props: { title: publication.title }, status: :gone
    end
  end
end
