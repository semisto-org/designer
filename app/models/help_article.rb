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
  MARKDOWN_OPTIONS = {
    extension: { table: true, strikethrough: true, autolink: true, tasklist: true, header_ids: "" },
    parse: { smart: true },
    render: { unsafe: false }
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
      I18n.transliterate(text.to_s.downcase.tr("’", "'").gsub("œ", "oe").gsub("æ", "ae"))
    end

    private
      def parse(file)
        raw = File.read(file)
        match = FRONT_MATTER.match(raw)
        return nil unless match
        meta = YAML.safe_load(match[1]) || {}
        new(slug: File.basename(file, ".md"), title: meta.fetch("title"), summary: meta["summary"].to_s,
            category: meta.fetch("category"), order: meta.fetch("order", 100).to_i, markdown: raw[match.end(0)..])
      end
  end

  def initialize(slug:, title:, summary:, category:, order:, markdown:)
    @slug, @title, @summary, @category, @order, @markdown = slug, title, summary, category, order, markdown
  end

  def html
    @html ||= Commonmarker.to_html(markdown, options: MARKDOWN_OPTIONS, plugins: { syntax_highlighter: nil })
  end

  # Level-2 headings, for the "on this page" list: [{ id:, text: }].
  def headings
    @headings ||= html.scan(%r{<h2><a href="#([^"]+)"[^>]*></a>(.*?)</h2>}m).map { |id, text| { id:, text: ActionController::Base.helpers.strip_tags(text) } }
  end

  # Plain text of the body (no Markdown), for search and excerpts.
  def plain_text
    @plain_text ||= ActionController::Base.helpers.strip_tags(html).squish
  end

  # nil when a word is missing, otherwise a relevance score.
  def score(words)
    title_text = self.class.normalize(title)
    summary_text = self.class.normalize(summary)
    category_text = self.class.normalize(category)
    body_text = self.class.normalize(plain_text)
    return nil unless words.all? { |w| [ title_text, summary_text, category_text, body_text ].any? { |text| text.include?(w) } }
    words.sum do |word|
      (title_text.include?(word) ? 10 : 0) + (summary_text.include?(word) ? 4 : 0) +
        (category_text.include?(word) ? 2 : 0) + [ body_text.scan(word).size, 5 ].min
    end
  end

  # A short passage of the body around the first matching word.
  def excerpt(words, length: 160)
    return summary if words.blank?
    haystack = self.class.normalize(plain_text)
    position = words.filter_map { |w| haystack.index(w) }.min
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
