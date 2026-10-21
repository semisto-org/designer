require "test_helper"

class PagesControllerTest < ActionDispatch::IntegrationTest
  PAGES = {
    "/fonctionnalites" => "pages/features",
    "/tarifs" => "pages/pricing",
    "/carnets-ouverts" => "pages/gallery",
    "/mission-drone" => "pages/drone",
    "/open-source" => "pages/open_source",
    "/ecoconception" => "pages/ecoconception",
    "/confidentialite" => "pages/privacy",
    "/conditions" => "pages/terms"
  }.freeze

  def inertia_page(path)
    get path, headers: inertia_headers
    assert_response :success
    response.parsed_body
  end

  test "home renders for visitors" do
    assert_equal "pages/home", inertia_page("/")["component"]
  end

  test "signed-in users are sent to their maps from the home page" do
    sign_in_as users(:michael)
    get "/"
    assert_redirected_to maps_path
  end

  test "every public page renders without signing in" do
    PAGES.each do |path, component|
      assert_equal component, inertia_page(path)["component"], path
    end
  end

  test "public pages stay readable for signed-in users" do
    sign_in_as users(:michael)
    PAGES.each_key { |path| inertia_page(path) }
  end

  test "the legal texts are in the HTML for readers without JavaScript" do
    get "/confidentialite"
    assert_response :success
    assert_select "#prerendered h1", "Politique de confidentialité"
    assert_select "#prerendered h2", /Ce que nous recevons de Google/
    assert_select "#prerendered", /Limited Use/
    assert_select "#prerendered", /#{Regexp.escape(Billing.contact_email)}/

    get "/conditions"
    assert_select "#prerendered h1", "Conditions d'utilisation"
    assert_select "#prerendered li", /79 € TTC/

    get "/tarifs"
    assert_select "#prerendered", false
  end

  test "pages carry server-side meta tags: title, description, canonical and Open Graph" do
    meta = inertia_page("/tarifs").dig("props", "_inertia_meta")
    by_key = meta.index_by { |tag| tag["headKey"] }
    assert_equal "Tarifs · Semisto Terranova", by_key.dig("title", "innerContent")
    assert_includes by_key.dig("description", "content"), "79 €"
    assert_equal "http://www.example.com/tarifs", by_key.dig("canonical", "href")
    assert_equal "http://www.example.com/tarifs", by_key.dig("og:url", "content")
    assert_equal "Tarifs", by_key.dig("og:title", "content")
    assert_equal "http://www.example.com/og-image.png", by_key.dig("og:image", "content")
  end

  test "the home page declares structured data" do
    meta = inertia_page("/").dig("props", "_inertia_meta")
    ld = meta.find { |tag| tag["headKey"] == "ld-json" }
    assert_equal "application/ld+json", ld["type"]
    assert_equal "WebApplication", ld.dig("innerContent", "@type")
  end

  test "the pricing page exposes the catalogue and the member price" do
    props = inertia_page("/tarifs")["props"]
    prices = props["catalog"].to_h { |plan| [ plan["key"], plan["priceCents"] ] }
    assert_equal({ "free" => 0, "yearly" => 7_900, "atelier" => 4_900, "bureau" => 12_900, "drone" => 38_000 }, prices)
    assert_equal 5_900, props["memberPriceCents"]
    assert_equal [ 1, 3, 6, 30 ], props["catalog"].first(4).map { |plan| plan["maxMaps"] }
  end

  test "the full HTML page renders the meta tags for crawlers and link previews" do
    get "/tarifs"
    assert_response :success
    assert_select "title", text: "Tarifs · Semisto Terranova", count: 1
    assert_select "meta[name=description]", count: 1
    assert_select "link[rel=canonical][href='http://www.example.com/tarifs']"
    assert_select "meta[property='og:title'][content=Tarifs]"
  end

  test "the pricing page declares its FAQ as structured data" do
    meta = inertia_page("/tarifs").dig("props", "_inertia_meta")
    ld = meta.find { |tag| tag["headKey"] == "ld-json" }
    assert_equal "FAQPage", ld.dig("innerContent", "@type")
    questions = ld.dig("innerContent", "mainEntity")
    assert_operator questions.size, :>=, 5
    assert(questions.all? { |q| q["name"].present? && q.dig("acceptedAnswer", "text").present? })
  end

  test "the legal pages and the pricing page get the contact address" do
    %w[/confidentialite /conditions /tarifs].each do |path|
      assert_equal Billing.contact_email, inertia_page(path).dig("props", "contactEmail"), path
    end
  end

  test "the sitemap lists the public pages and every help article" do
    get "/sitemap.xml"
    assert_response :success
    assert_equal "application/xml", response.media_type
    assert_includes response.body, "<loc>http://www.example.com/tarifs</loc>"
    assert_includes response.body, "<loc>http://www.example.com/help/#{HelpArticle.all.first.slug}</loc>"
    assert_not_includes response.body, "/billing"
    assert_includes response.body, "<loc>http://www.example.com/ecoconception</loc>"
  end

  test "the ecoconception page shows the latest measurements and says which commit runs" do
    EcoMeasurement.create!(screen: "home", environment: "production", url: "https://terranova.semisto.org/", dom_elements: 324,
      requests: 34, bytes: 2055 * 1024, measured_at: Time.current)
    with_source_commit("abc123") do
      assert_equal "C", inertia_page("/ecoconception").dig("props", "measurements", 0, "grade")
      get "/ecoconception.json"
      assert_equal "abc123", response.parsed_body["commit"]
    end
  end

  def with_source_commit(value)
    previous = ENV["SOURCE_COMMIT"]
    ENV["SOURCE_COMMIT"] = value
    yield
  ensure
    ENV["SOURCE_COMMIT"] = previous
  end

  test "the standout features point to real help articles and pictures" do
    standouts = I18n.t("site.standouts", locale: :fr)
    links = standouts[:entries].map { |e| e[:link] } + standouts[:margins][:notes].filter_map { |n| n[:link] }
    links.each do |link|
      slug = link.delete_prefix("/help/")
      assert Rails.root.join("app/help/#{slug}.md").exist?, "#{link} has no help article"
    end
    standouts[:entries].each do |entry|
      assert Rails.root.join("app/frontend/components/site/standouts/#{entry[:image]}.webp").exist?, "#{entry[:image]}.webp is missing"
    end
  end

  test "the features page visits the notebook Semisto chose and shows the gallery" do
    page = inertia_page("/fonctionnalites")
    assert_nil page.dig("props", "tour"), "nothing chosen yet: the visit has no map"
    assert_equal [], page.dig("props", "gallery")

    map = maps(:ahinvaux)
    publication = MapPublication.publish!(map, by: map.owner, title: "Les 4 Sources", options: { "in_gallery" => true })
    publication.choose_for_tour!
    props = inertia_page("/fonctionnalites")["props"]
    assert_equal "Les 4 Sources", props.dig("tour", "title")
    assert_equal publication.public_path, props.dig("tour", "path")
    assert props.dig("tour", "features", "features")
    assert_equal [ publication.token ], props["gallery"].map { |card| card["token"] }
    assert_equal [ publication.token ], inertia_page("/carnets-ouverts").dig("props", "gallery").map { |card| card["token"] }
  end

  test "the features copy has a scene the canvas knows for every station" do
    scenes = %w[place layers climate existing field water drafts structure palette growth share]
    stations = I18n.t("site.features.chapters").flat_map { |chapter| chapter[:stations] }
    assert_operator stations.size, :>=, 12
    stations.each { |station| assert_includes scenes, station[:scene], station[:title] }
  end

  test "the stations link to help articles that exist" do
    slugs = HelpArticle.all.map(&:slug)
    I18n.t("site.features.chapters").flat_map { |chapter| chapter[:stations] }.filter_map { |s| s[:link] }.each do |link|
      next unless link.start_with?("/help/")
      assert_includes slugs, link.delete_prefix("/help/"), link
    end
  end
end
