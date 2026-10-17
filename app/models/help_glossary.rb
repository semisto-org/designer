# The words of the forest garden (app/help/glossary.yml): the « Lexique »
# guide lists them, and the first time a guide uses one, it becomes a link
# to its entry that shows the definition on hover or focus (.help-term in
# application.css).
class HelpGlossary
  FILE = Rails.root.join("app/help/glossary.yml")
  SLUG = "lexique"
  # Where a word is not annotated: links, headings, code, and the glossary itself.
  SKIP = %w[a code pre h1 h2 h3 h4 h5 h6].freeze

  Term = Data.define(:term, :forms, :definition) do
    def anchor = HelpArticle.normalize(term).gsub(/[^a-z0-9]+/, "-").delete_prefix("-").delete_suffix("-")

    # Longest spelling first, whole words only, any case.
    def pattern
      spellings = [ term, *forms ].sort_by { |s| -s.length }.map { |s| Regexp.escape(s) }.join("|")
      Regexp.new("(?<![\\p{L}\\p{N}-])(#{spellings})(?![\\p{L}\\p{N}-])", Regexp::IGNORECASE)
    end
  end

  class << self
    def terms
      mtime = File.exist?(FILE) ? File.mtime(FILE).to_f : nil
      return @terms[:list] if @terms && @terms[:mtime] == mtime
      list = mtime ? Array(YAML.safe_load_file(FILE)).map { |t| Term.new(term: t.fetch("term"), forms: Array(t["forms"]), definition: t.fetch("definition")) } : []
      @terms = { mtime:, list: list.sort_by { |t| HelpArticle.normalize(t.term) }, patterns: list.to_h { |t| [ t, t.pattern ] } }
      @terms[:list]
    end

    def mtime = File.exist?(FILE) ? File.mtime(FILE).to_f : 0

    # The « Lexique » guide, built from the list: one section per letter.
    def article
      return nil if terms.empty?
      HelpArticle.new(slug: SLUG, title: I18n.t("help.glossary.title"), summary: I18n.t("help.glossary.summary"),
        category: I18n.t("help.glossary.category"), order: 16, markdown: markdown, html: html)
    end

    def markdown
      terms.map { |t| "**#{t.term}** : #{t.definition}" }.join("\n\n")
    end

    def html
      terms.group_by { |t| HelpArticle.normalize(t.term)[0].upcase }.map do |letter, list|
        entries = list.map { |t| %(<p id="#{t.anchor}"><strong>#{ERB::Util.h(t.term)}</strong> : #{ERB::Util.h(t.definition)}</p>) }
        %(<h2 id="lettre-#{letter.downcase}">#{letter}</h2>\n#{entries.join("\n")})
      end.join("\n")
    end

    # The first use of each word in a guide becomes a .help-term link.
    def annotate(html)
      return html if terms.empty?
      fragment = Nokogiri::HTML5.fragment(html)
      pending = terms.dup
      fragment.traverse do |node|
        break if pending.empty?
        next unless node.text? && node.ancestors.none? { |a| SKIP.include?(a.name) }
        annotate_node(node, pending)
      end
      fragment.to_html
    end

    private
      def annotate_node(node, pending)
        text = node.content
        found = pending.filter_map { |t| (m = @terms[:patterns][t].match(text)) && [ m.begin(0), m, t ] }.min_by(&:first)
        return unless found
        _, match, term = found
        pending.delete(term)
        link = Nokogiri::XML::Node.new("a", node.document)
        link["href"] = "/help/#{SLUG}##{term.anchor}"
        link["class"] = "help-term"
        link["data-definition"] = term.definition
        link.content = match[0]
        after = Nokogiri::XML::Text.new(text[match.end(0)..], node.document)
        node.content = text[0...match.begin(0)]
        node.add_next_sibling(link)
        link.add_next_sibling(after)
        annotate_node(after, pending) unless pending.empty?
      end
  end
end
