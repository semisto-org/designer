# The public, read-only view of a map: GET /p/:token, no account needed.
# It serves the snapshot taken at publication, never the live map.
class PublicMapsController < ApplicationController
  include PublicMeta

  allow_unauthenticated_access
  before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }

  def show
    publication = MapPublication.includes(:map).find_by!(token: params[:token])
    if publication.live?
      render inertia: "public_maps/show", props: publication.as_public, meta: public_meta(publication)
    else
      render inertia: "public_maps/gone", props: { title: publication.title }, status: :gone
    end
  end

  private
    # The link preview: the map's own title, a sentence on the garden and
    # its painted image (the site's generic one until it is painted).
    def public_meta(publication)
      image = publication.preview_path && "#{request.base_url}#{publication.preview_path}"
      tags = meta_tags(title: publication.title, description: publication.description.presence || summary(publication), image:)
      tags += [ { property: "og:image:width", head_key: "og:image:width", content: "1200" },
                { property: "og:image:height", head_key: "og:image:height", content: "630" } ] if image
      tags
    end

    def summary(publication)
      area = publication.snapshot.dig("map", "area_m2")
      place = publication.locality || publication.snapshot.dig("map", "region", "name")
      key = [ area ? "area" : nil, place ? "place" : nil ].compact.join("_").presence || "plain"
      t("public_maps.meta.#{key}", area: area && helpers.number_with_delimiter(area.round, delimiter: " "), place:)
    end
end
