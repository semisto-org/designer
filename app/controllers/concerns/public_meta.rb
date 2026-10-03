# Server-rendered <head> tags (title, description, canonical, Open Graph) for
# the public pages, so crawlers and link previews (newsletters, social
# networks) see them without running JavaScript. The page components render
# the same keys on the client (components/Seo.tsx) for in-app navigation.
module PublicMeta
  extend ActiveSupport::Concern

  SITE_NAME = "Semisto Designer".freeze

  private
    # Renders an Inertia page with its meta tags. `page` is the key under
    # site.seo.* (title and description live in config/locales/site.fr.yml).
    def render_public(component, page:, props: {}, json_ld: nil, title: nil, description: nil)
      title ||= t("site.seo.#{page}.title")
      description ||= t("site.seo.#{page}.description")
      render inertia: component, props:, meta: meta_tags(title:, description:, json_ld:)
    end

    def meta_tags(title:, description:, json_ld: nil)
      url = canonical_url
      tags = [
        { title: "#{title} · #{SITE_NAME}" },
        { name: "description", head_key: "description", content: description },
        { tag_name: "link", head_key: "canonical", rel: "canonical", href: url },
        { property: "og:type", head_key: "og:type", content: "website" },
        { property: "og:site_name", head_key: "og:site_name", content: SITE_NAME },
        { property: "og:locale", head_key: "og:locale", content: "fr_BE" },
        { property: "og:title", head_key: "og:title", content: title },
        { property: "og:description", head_key: "og:description", content: description },
        { property: "og:url", head_key: "og:url", content: url },
        { property: "og:image", head_key: "og:image", content: "#{request.base_url}/og-image.png" },
        { name: "twitter:card", head_key: "twitter:card", content: "summary_large_image" }
      ]
      tags << { tag_name: "script", head_key: "ld-json", type: "application/ld+json", inner_content: json_ld } if json_ld
      tags
    end

    def canonical_url
      "#{request.base_url}#{request.path == '/' ? '/' : request.path.chomp('/')}"
    end
end
