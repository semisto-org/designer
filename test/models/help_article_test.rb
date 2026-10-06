require "test_helper"

class HelpArticleTest < ActiveSupport::TestCase
  EXPECTED_SLUGS = %w[
    creer-sa-premiere-carte le-parcours-en-quatre-etapes remplir-la-fiche-projet
    choisir-ses-parcelles lire-les-couches-du-geoportail la-vue-drone dessiner-l-existant calques-mesures-et-croquis
    lire-le-relief-et-l-eau le-climat-d-aujourd-hui-et-de-demain analyser-son-sol photos-et-suivi-dans-le-temps
    construire-sa-palette-et-ses-patches la-liste-de-plants-et-la-commande planter-puis-observer
    les-alertes-reglementaires le-tableau-financier
    partager-et-commenter publier-sa-carte imprimer-un-plan-a-l-echelle
    connecter-claude relire-les-brouillons-de-claude formules-et-forfait
  ].freeze

  # The help center's categories, in display order.
  CATEGORIES = [
    "Démarrer", "Cartographier", "Comprendre son terrain", "Concevoir",
    "Partager et collaborer", "Claude et l'IA", "Compte et formules"
  ].freeze

  FRONT_MATTER_KEYS = %w[category order summary title].freeze

  # Where the editor's "Aide" button finds the guide of each panel.
  HELP_ACTION = Rails.root.join("app/frontend/map/panels/HelpAction.tsx")
  PANELS = Rails.root.join("app/frontend/map/panels/index.ts")

  test "ships the expected articles and every file has a valid front matter" do
    files = Dir.glob(HelpArticle::DIR.join("*.md")).map { |f| File.basename(f, ".md") }
    assert_equal EXPECTED_SLUGS.sort, files.sort & EXPECTED_SLUGS
    assert_equal files.sort, HelpArticle.all.map(&:slug).sort, "an article was ignored: check its front matter"
    HelpArticle.all.each do |article|
      assert article.title.present? && article.summary.present? && article.category.present?, article.slug
    end
  end

  test "the plant identification article is in the design category" do
    article = HelpArticle.find("identifier-une-plante")
    assert_equal "Concevoir", article.category
    assert_includes article.html, "Pl@ntNet"
    assert_equal "identifier-une-plante", HelpArticle.search("photographier feuille fleur").first.slug
  end

  test "every article has exactly the four front matter keys and a known category" do
    Dir.glob(HelpArticle::DIR.join("*.md")).each do |file|
      slug = File.basename(file, ".md")
      front_matter = File.read(file)[HelpArticle::FRONT_MATTER, 1]
      assert front_matter, "#{slug}: no front matter"
      data = YAML.safe_load(front_matter)
      assert_equal FRONT_MATTER_KEYS, data.keys.sort, slug
      assert data["title"].to_s.strip.present?, "#{slug}: empty title"
      assert data["summary"].to_s.strip.present?, "#{slug}: empty summary"
      assert_includes CATEGORIES, data["category"], "#{slug}: unknown category"
      assert_kind_of Integer, data["order"], "#{slug}: order must be an integer"
    end
  end

  test "internal links point to existing articles" do
    HelpArticle.all.each do |article|
      article.markdown.scan(%r{\]\(/help/([^)#\s]+)}).flatten.each do |target|
        assert HelpArticle.find(target), "#{article.slug} links to a missing article: #{target}"
      end
    end
  end

  test "every editor panel has a guide in the Aide button, and every guide exists" do
    source = HELP_ACTION.read
    block = source[/const ARTICLE_BY_PANEL\b.*?= \{(.*?)\n\}/m, 1]
    assert block, "ARTICLE_BY_PANEL not found in #{HELP_ACTION}"
    mapping = block.scan(/^\s*'?([\w-]+)'?:\s*'([a-z0-9-]+)',?\s*$/).to_h
    assert_equal block.strip.lines.size, mapping.size, "an ARTICLE_BY_PANEL line was not understood"

    panels = PANELS.read[/export const PANELS\b.*?= \[(.*?)\n\]/m, 1].scan(/\bid: '([\w-]+)'/).flatten
    assert_not_empty panels
    assert_equal panels.sort, mapping.keys.sort, "ARTICLE_BY_PANEL and PANELS must list the same panels"

    slugs = mapping.values + source.scan(/const ARTICLE_FOR_\w+ = '([a-z0-9-]+)'/).flatten
    slugs.uniq.each { |slug| assert HelpArticle.find(slug), "HelpAction.tsx names a missing article: #{slug}" }
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
    assert_equal CATEGORIES, names
    cartographier = HelpArticle.categories.find { |c| c[:name] == "Cartographier" }[:articles]
    assert_equal %w[choisir-ses-parcelles lire-les-couches-du-geoportail la-vue-drone caler-un-fond-de-plan dessiner-l-existant calques-mesures-et-croquis], cartographier.map(&:slug)
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
