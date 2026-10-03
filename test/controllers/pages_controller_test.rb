require "test_helper"

class PagesControllerTest < ActionDispatch::IntegrationTest
  PAGES = {
    "/fonctionnalites" => "pages/features",
    "/tarifs" => "pages/pricing",
    "/mission-drone" => "pages/drone",
    "/open-source" => "pages/open_source",
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

  test "pages carry server-side meta tags: title, description, canonical and Open Graph" do
    meta = inertia_page("/tarifs").dig("props", "_inertia_meta")
    by_key = meta.index_by { |tag| tag["headKey"] }
    assert_equal "Tarifs · Semisto Designer", by_key.dig("title", "innerContent")
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
    assert_equal({ "free" => 0, "yearly" => 7_900, "atelier" => 4_900, "bureau" => 9_900, "drone" => 28_000 }, prices)
    assert_equal 5_530, props["memberPriceCents"]
    assert_equal [ 1, 10, 5, 20 ], props["catalog"].first(4).map { |plan| plan["maxMaps"] }
  end

  test "the full HTML page renders the meta tags for crawlers and link previews" do
    get "/tarifs"
    assert_response :success
    assert_select "title", text: "Tarifs · Semisto Designer", count: 1
    assert_select "meta[name=description]", count: 1
    assert_select "link[rel=canonical][href='http://www.example.com/tarifs']"
    assert_select "meta[property='og:title'][content=Tarifs]"
  end
end
