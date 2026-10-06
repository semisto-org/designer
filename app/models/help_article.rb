# A help center article: a Markdown file in app/help/ with a front matter
# (title, summary, category, order). The slug is the file name. Articles are
# versioned with the code; there is no database table.
#
#   ---
#   title: Créer sa première carte
#   summary: Une phrase qui dit ce que l'article apporte.
#   category: Démarrer
#   order: 10
#   ---
class HelpArticle
  DIR = Rails.root.join("app/help")
  FRONT_MATTER = /\A---\s*\n(.*?)\n---\s*\n/m
  HEADING_ANCHOR = %r{<a href="#[^"]*" aria-label="[^"]*" data-heading-content="[^"]*" class="anchor"></a>}
  MARKDOWN_OPTIONS = {
    extension: { table: true, strikethrough: true, autolink: true, tasklist: true, header_ids: "" },
    parse: { smart: true },
    render: { unsafe: false }
  }.freeze
  # Old slug => new slug, for articles that changed name.
  RENAMED = {
    "connecter-claude" => "connecter-son-ia",
    "relire-les-brouillons-de-claude" => "relire-les-brouillons-de-l-ia"
  }.freeze

  attr_reader :slug, :title, :summary, :category, :order, :markdown

  class << self
    # Every article, ordered by category (lowest article order first) then order.
    def all
      files = Dir.glob(DIR.join("*.md")).sort
      signature = files.map { |file| [ file, File.mtime(file).to_f ] }
      return @cache[:articles] if @cache && @cache[:signature] == signature
      articles = files.filter_map { |file| parse(file) }
      first_order = articles.group_by(&:category).transform_values { |list| list.map(&:order).min }
      articles.sort_by! { |a| [ first_order[a.category], a.category, a.order, a.title ] }
      @cache = { signature:, articles: articles }
      articles
    end

    def find(slug)
      all.find { |article| article.slug == slug.to_s }
    end

    # The new slug of a renamed article, so old links keep working.
    def renamed_to(slug)
      RENAMED[slug.to_s]
    end

    # [{ name:, articles: [HelpArticle] }] in display order.
    def categories
      all.group_by(&:category).map { |name, articles| { name:, articles: } }
    end

    # Simple full-text search: every word must appear (accents and case are
    # ignored); title hits weigh more than summary, then body.
    def search(query)
      words = tokenize(query)
      return [] if words.empty?
      all.filter_map { |article| (score = article.score(words)) && [ score, article ] }
        .sort_by { |score, article| [ -score, article.order ] }.map(&:last)
    end

    def tokenize(text)
      normalize(text).scan(/[a-z0-9]{2,}/).uniq
    end

    def normalize(text)
      text = text.to_s.dup
      text.force_encoding(Encoding::UTF_8) if text.encoding == Encoding::BINARY
      I18n.transliterate(text.scrub.downcase.tr("’", "'").gsub("œ", "oe").gsub("æ", "ae"))
    end

    private
      def parse(file)
        raw = File.read(file)
        match = FRONT_MATTER.match(raw)
        return nil unless match
        meta = YAML.safe_load(match[1]) || {}
        new(slug: File.basename(file, ".md"), title: meta.fetch("title"), summary: meta["summary"].to_s,
            category: meta.fetch("category"), order: meta.fetch("order", 100).to_i, markdown: raw[match.end(0)..])
      rescue Psych::SyntaxError, KeyError => e
        # One broken article must not take the whole help center down.
        Rails.logger.error("Help article #{File.basename(file)} ignored: #{e.message}")
        nil
      end
  end

  def initialize(slug:, title:, summary:, category:, order:, markdown:)
    @slug, @title, @summary, @category, @order, @markdown = slug, title, summary, category, order, markdown
  end

  def html
    @html ||= Commonmarker.to_html(markdown, options: MARKDOWN_OPTIONS, plugins: { syntax_highlighter: nil })
      .gsub(HEADING_ANCHOR, "")   # keep the heading ids, drop the English "Link to heading" anchors
  end

  # Level-2 headings, for the "on this page" list: [{ id:, text: }].
  def headings
    @headings ||= html.scan(%r{<h2 id="([^"]+)">(.*?)</h2>}m).map { |id, text| { id:, text: ActionController::Base.helpers.strip_tags(text) } }
  end

  # Plain text of the body (no Markdown), for search and excerpts.
  def plain_text
    @plain_text ||= ActionController::Base.helpers.strip_tags(html).squish
  end

  # nil when a query word is missing, otherwise a relevance score. A word
  # matches the start of a word of the text ("plant" finds "plants").
  def score(words)
    fields = { title: title, summary: summary, category: category, body: plain_text }
      .transform_values { |text| self.class.normalize(text) }
    patterns = words.index_with { |word| /\b#{Regexp.escape(word)}/ }
    return nil unless patterns.all? { |_, pattern| fields.values.any? { |text| text.match?(pattern) } }
    patterns.sum do |_, pattern|
      (fields[:title].match?(pattern) ? 10 : 0) + (fields[:summary].match?(pattern) ? 4 : 0) +
        (fields[:category].match?(pattern) ? 2 : 0) + [ fields[:body].scan(pattern).size, 5 ].min
    end
  end

  # A short passage of the body around the first matching word.
  def excerpt(words, length: 160)
    return summary if words.blank?
    haystack = self.class.normalize(plain_text)
    position = words.filter_map { |w| haystack.index(/\b#{Regexp.escape(w)}/) }.min
    return summary if position.nil?
    start = [ position - 50, 0 ].max
    snippet = plain_text[start, length].to_s
    "#{'…' if start.positive?}#{snippet}#{'…' if start + length < plain_text.length}"
  end

  def as_json(*)
    { slug:, title:, summary:, category:, url: "/help/#{slug}" }
  end

  def to_drawer_json
    as_json.merge(html:, headings:)
  end
end
