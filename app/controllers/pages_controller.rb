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

  # What a page view of Terranova costs, measured after each deployment
  # (EcoMeasurement). The JSON also tells the « EcoIndex » workflow which
  # commit is online, so it measures only once the new one is.
  def ecoconception
    props = { measurements: EcoMeasurement.latest_with_history, commit: ENV["SOURCE_COMMIT"].presence }
    respond_to do |format|
      format.html { render_public "pages/ecoconception", page: :ecoconception, props: }
      format.json { render json: props }
    end
  end
  def privacy = render_legal(:privacy)
  def terms = render_legal(:terms)

  # The public pages and every help article, for search engines.
  def sitemap
    @urls = [ [ "/", 1.0 ], [ "/fonctionnalites", 0.9 ], [ "/tarifs", 0.9 ], [ "/mission-drone", 0.6 ], [ "/open-source", 0.5 ], [ "/ecoconception", 0.4 ],
              [ "/help", 0.7 ], [ "/confidentialite", 0.2 ], [ "/conditions", 0.2 ] ]
    @urls += HelpArticle.all.map { |article| [ "/help/#{article.slug}", 0.6 ] }
    render formats: :xml
  end

  private
    # The legal texts are also written into the HTML (layouts/application),
    # so readers without JavaScript see them: Google checks the privacy
    # policy that way before it shows the app's name on its sign-in screen.
    def render_legal(namespace)
      prices = %w[yearly atelier bureau drone].to_h { |key| [ key.to_sym, euros(Billing::Catalog.fetch(key).price_cents) ] }
      @legal_text = { namespace:, vars: { email: Billing.contact_email, **prices } }
      render_public "pages/#{namespace}", page: namespace, props: { contactEmail: Billing.contact_email, catalog: Billing::Catalog.as_json }
    end

    # "79 €", "55,30 €", like formatPrice in lib/money.ts.
    def euros(cents)
      precision = (cents % 100).zero? ? 0 : 2
      ActiveSupport::NumberHelper.number_to_currency(cents / 100.0, unit: "€", format: "%n %u", separator: ",", delimiter: " ", precision:)
    end

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
