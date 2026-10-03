# The public website: visitors land here, signed-in users go to their maps.
class PagesController < ApplicationController
  include PublicMeta

  allow_unauthenticated_access

  def home
    return redirect_to(maps_path) if authenticated?
    render_public "pages/home", page: :home, props: { catalog: Billing::Catalog.as_json }, json_ld: {
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
    render_public "pages/pricing", page: :pricing, json_ld: faq_json_ld, props: {
      catalog: Billing::Catalog.as_json,
      memberPriceCents: Billing::Catalog.member_price_cents,
      contactEmail: Billing.contact_email
    }
  end

  def drone = render_public("pages/drone", page: :drone, props: { priceCents: Billing::Catalog.find("drone").price_cents })
  def open_source = render_public("pages/open_source", page: :open_source)
  def privacy = render_public("pages/privacy", page: :privacy, props: { contactEmail: Billing.contact_email, catalog: Billing::Catalog.as_json })
  def terms = render_public("pages/terms", page: :terms, props: { contactEmail: Billing.contact_email, catalog: Billing::Catalog.as_json })

  private
    # The pricing FAQ as schema.org FAQPage, straight from the page copy.
    def faq_json_ld
      items = Array(t("site.pricing.faq.items"))
      return if items.empty?
      {
        "@context" => "https://schema.org",
        "@type" => "FAQPage",
        "mainEntity" => items.map do |item|
          { "@type" => "Question", "name" => item[:q], "acceptedAnswer" => { "@type" => "Answer", "text" => item[:a] } }
        end
      }
    end
end
