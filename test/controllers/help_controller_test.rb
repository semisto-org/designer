require "test_helper"

class HelpControllerTest < ActionDispatch::IntegrationTest
  test "the index is public and lists the categories" do
    get "/help", headers: inertia_headers
    assert_response :success
    page = response.parsed_body
    assert_equal "help/index", page["component"]
    assert_equal 6, page["props"]["categories"].size
    assert_equal "Démarrer", page["props"]["categories"].first["name"]
    assert_empty page["props"]["results"]
  end

  test "searching returns matching articles with an excerpt" do
    get "/help", params: { q: "ruissellement" }, headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal "ruissellement", props["query"]
    assert_equal "lire-les-couches-du-geoportail", props["results"].first["slug"]
    assert_match(/ruissellement/i, props["results"].first["excerpt"])
  end

  test "searching with no match returns an empty list" do
    get "/help", params: { q: "zzzzzz" }, headers: inertia_headers
    assert_empty response.parsed_body["props"]["results"]
  end

  test "an article page renders its HTML" do
    get "/help/formules-et-forfait", headers: inertia_headers
    assert_response :success
    props = response.parsed_body["props"]
    assert_equal "help/show", response.parsed_body["component"]
    assert_equal "Formules et forfait", props["article"]["title"]
    assert_includes props["article"]["html"], "<h2"
    assert_not_includes props["related"].map { |a| a["slug"] }, "formules-et-forfait"
  end

  test "an article is served as JSON for the help drawer" do
    get "/help/connecter-claude.json"
    assert_response :success
    json = response.parsed_body
    assert_equal %w[category headings html slug summary title url], json.keys.sort
    assert_equal "/help/connecter-claude", json["url"]
  end

  test "the JSON endpoint is public and answers 404 for an unknown article" do
    get "/help/inconnu.json"
    assert_response :not_found
    assert_equal "Cet article d'aide n'existe pas.", response.parsed_body["message"]
  end

  test "an unknown article page goes back to the help center" do
    get "/help/inconnu"
    assert_redirected_to help_center_path
  end

  test "article pages carry their own title and description in the meta tags" do
    get "/help/connecter-claude", headers: inertia_headers
    meta = response.parsed_body.dig("props", "_inertia_meta").index_by { |tag| tag["headKey"] }
    assert_equal "Connecter Claude · Semisto Designer", meta.dig("title", "innerContent")
    assert_includes meta.dig("description", "content"), "assistant IA"
  end
end
