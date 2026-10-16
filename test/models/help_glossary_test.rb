require "test_helper"

class HelpGlossaryTest < ActiveSupport::TestCase
  test "every word has a definition and its own anchor" do
    terms = HelpGlossary.terms
    assert_operator terms.size, :>=, 20
    assert terms.all? { |t| t.definition.present? }
    assert_equal terms.size, terms.map(&:anchor).uniq.size
    assert_equal "point-cle", terms.find { |t| t.term == "Point clé" }.anchor
  end

  test "the lexicon is a guide of its own, a section per letter, found by search" do
    article = HelpArticle.find("lexique")
    assert_equal "Le lexique du jardin-forêt", article.title
    assert_includes article.headings.map { |h| h[:text] }, "B"
    assert_includes article.html, %(<p id="baissiere"><strong>Baissière</strong>)
    assert_includes HelpArticle.search("lexique").map(&:slug), "lexique"
  end

  test "the first use of a word in a guide links to its definition, once, outside links and headings" do
    html = HelpGlossary.annotate("<h2>Baissière</h2><p>Une baissière, puis une autre baissière. <a href=\"/x\">vallon</a> et un vallon.</p><p><code>keyline</code></p>")
    doc = Nokogiri::HTML5.fragment(html)
    terms = doc.css("a.help-term")
    assert_equal %w[baissière vallon], terms.map(&:text)
    assert_equal "/help/lexique#baissiere", terms.first["href"]
    assert_match(/courbe de niveau/, terms.first["data-definition"])
    assert_equal "Baissière", doc.at_css("h2").text
    assert_nil doc.at_css("code a")
  end
end
