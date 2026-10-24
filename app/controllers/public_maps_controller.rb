# The public, read-only view of a map: GET /p/:token, no account needed.
# It serves the snapshot taken at publication, never the live map.
class PublicMapsController < ApplicationController
  include PublicMeta
  include EmbeddablePublicView

  allow_unauthenticated_access
  before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }

  def show
    publication = MapPublication.includes(:map).find_by!(token: params[:token])
    if publication.live?
      count_visit(publication)
      render inertia: "public_maps/show", props: publication.as_public, meta: public_meta(publication)
    else
      render inertia: "public_maps/gone", props: { title: publication.title }, status: :gone
    end
  end

  private
    BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|headless/i

    # One visit per browser session, never the map's own people or a link
    # preview robot. It also remembers the map for a sign-up that follows.
    def count_visit(publication)
      return if request.user_agent.to_s.match?(BOTS)
      return if authenticated? && publication.map.role_for(Current.user)
      session[:source_publication_id] = publication.id
      seen = Array(session[:seen_publications])
      return if seen.include?(publication.id)
      session[:seen_publications] = (seen << publication.id).last(20)
      MapPublication.update_counters(publication.id, views_count: 1)
    end

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
