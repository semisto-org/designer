require "test_helper"

class HelpArticleTest < ActiveSupport::TestCase
  EXPECTED_SLUGS = %w[
    creer-sa-premiere-carte choisir-ses-parcelles lire-les-couches-du-geoportail dessiner-l-existant
    construire-sa-palette-et-ses-patches partager-et-commenter connecter-claude formules-et-forfait
  ].freeze

  test "ships the starter articles and every file has a valid front matter" do
    files = Dir.glob(HelpArticle::DIR.join("*.md")).map { |f| File.basename(f, ".md") }
    assert_equal EXPECTED_SLUGS.sort, files.sort & EXPECTED_SLUGS
    assert_equal files.sort, HelpArticle.all.map(&:slug).sort, "an article was ignored: check its front matter"
    HelpArticle.all.each do |article|
      assert article.title.present? && article.summary.present? && article.category.present?, article.slug
    end
  end

  test "renders Markdown to HTML with heading ids and no English anchors" do
    article = HelpArticle.find("formules-et-forfait")
    assert_includes article.html, "<h2 id=\"la-carte-gratuite\">La carte gratuite</h2>"
    assert_not_includes article.html, "Link to heading"
    assert_includes article.headings, { id: "la-carte-gratuite", text: "La carte gratuite" }
  end

  test "does not let raw HTML through" do
    article = HelpArticle.new(slug: "x", title: "X", summary: "", category: "Test", order: 1, markdown: "ok <script>alert(1)</script>")
    assert_not_includes article.html, "<script>"
  end

  test "groups articles by category in reading order" do
    names = HelpArticle.categories.map { |c| c[:name] }
    assert_equal "Démarrer", names.first
    assert_equal names.uniq, names
    assert_equal %w[Cartographier], names.select { |n| n == "Cartographier" }
    cartographier = HelpArticle.categories.find { |c| c[:name] == "Cartographier" }[:articles]
    assert_equal %w[choisir-ses-parcelles lire-les-couches-du-geoportail dessiner-l-existant], cartographier.map(&:slug)
  end

  test "search finds articles by words in the body, ignoring case and accents" do
    assert_equal "lire-les-couches-du-geoportail", HelpArticle.search("RUISSELLEMENT").first.slug
    assert_equal "lire-les-couches-du-geoportail", HelpArticle.search("geoportail").first.slug
    assert_includes HelpArticle.search("Géoportail").map(&:slug), "choisir-ses-parcelles"
    assert_equal [ "connecter-claude" ], HelpArticle.search("mcp").map(&:slug)
  end

  test "search requires every word and ranks title hits first" do
    assert_equal [ "formules-et-forfait" ], HelpArticle.search("tva reconduction").map(&:slug)
    assert_empty HelpArticle.search("tva licorne")
    assert_equal "connecter-claude", HelpArticle.search("claude").first.slug
  end

  test "search matches the start of words, not any substring" do
    assert_includes HelpArticle.search("plant").map(&:slug), "construire-sa-palette-et-ses-patches"
    assert_empty HelpArticle.search("ouvelle xyz")
  end

  test "an empty or too short query finds nothing" do
    assert_empty HelpArticle.search("")
    assert_empty HelpArticle.search("a")
    assert_empty HelpArticle.search("   ")
  end

  test "excerpt shows the passage around the match" do
    article = HelpArticle.find("formules-et-forfait")
    assert_match(/reconduction/, article.excerpt(HelpArticle.tokenize("reconduction")))
    assert_equal article.summary, article.excerpt([])
  end

  test "an article with a broken front matter is ignored, not fatal" do
    Dir.mktmpdir do |dir|
      File.write(File.join(dir, "casse.md"), "---\ntitle: a: b: c\n---\ncorps")
      File.write(File.join(dir, "ok.md"), "---\ntitle: Ok\ncategory: Test\n---\ncorps")
      stub_const = HelpArticle::DIR
      HelpArticle.send(:remove_const, :DIR)
      HelpArticle.const_set(:DIR, Pathname(dir))
      HelpArticle.instance_variable_set(:@cache, nil)
      begin
        assert_equal [ "ok" ], HelpArticle.all.map(&:slug)
      ensure
        HelpArticle.send(:remove_const, :DIR)
        HelpArticle.const_set(:DIR, stub_const)
        HelpArticle.instance_variable_set(:@cache, nil)
      end
    end
  end
end
