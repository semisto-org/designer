# The public website: visitors land here, signed-in users go to their maps.
class PagesController < ApplicationController
  include PublicMeta

  allow_unauthenticated_access

  def home
    return redirect_to(maps_path) if authenticated?
    render_public "pages/home", page: :home, json_ld: {
      "@context" => "https://schema.org",
      "@type" => "WebApplication",
      "name" => PublicMeta::SITE_NAME,
      "url" => root_url,
      "applicationCategory" => "DesignApplication",
      "inLanguage" => "fr",
      "description" => t("site.seo.home.description"),
      "license" => "https://www.gnu.org/licenses/agpl-3.0.html",
      "publisher" => { "@type" => "Organization", "name" => "Semisto", "url" => "https://www.semisto.org" }
    }
  end

  def features = render_public("pages/features", page: :features)

  def pricing
    render_public "pages/pricing", page: :pricing, props: {
      catalog: Billing::Catalog.as_json,
      memberPriceCents: Billing::Catalog.member_price_cents
    }
  end

  def drone = render_public("pages/drone", page: :drone, props: { priceCents: Billing::Catalog.find("drone").price_cents })
  def open_source = render_public("pages/open_source", page: :open_source)
  def privacy = render_public("pages/privacy", page: :privacy)
  def terms = render_public("pages/terms", page: :terms)
end
