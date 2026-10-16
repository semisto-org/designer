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
  ACTION_LINK = %r{<a href="action:panel/([a-z0-9-]+)">}
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
      signature = files.map { |file| [ file, File.mtime(file).to_f ] } << HelpGlossary.mtime
      return @cache[:articles] if @cache && @cache[:signature] == signature
      articles = files.filter_map { |file| parse(file) }
      articles << HelpGlossary.article if HelpGlossary.article
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

    # Full-text search: every word must be found (accents and case are
    # ignored), as typed, through a synonym (app/help/synonyms.yml) or, from
    # four letters, with one slip (« baisière »); title hits weigh more than
    # summary, then body, and a slip weighs less than the word itself.
    def search(query)
      words = tokenize(query)
      return [] if words.empty?
      all.filter_map { |article| (score = article.score(words)) && [ score, article ] }
        .sort_by { |score, article| [ lexicon_last(article, words), -score, article.order ] }.map(&:last)
    end

    # The lexicon holds every word: it comes after the guides, unless asked for.
    def lexicon_last(article, words)
      article.slug == HelpGlossary::SLUG && !normalize(article.title).match?(/\b(#{words.map { |w| Regexp.escape(w) }.join('|')})/) ? 1 : 0
    end

    # The words that stand for `word`, itself first: [« mare », « etang »…].
    def alternatives(word)
      [ word, *synonyms.fetch(word, []) ]
    end

    def synonyms
      file = DIR.join("synonyms.yml")
      mtime = File.exist?(file) ? File.mtime(file).to_f : nil
      return @synonyms[:map] if @synonyms && @synonyms[:mtime] == mtime
      groups = mtime ? Array(YAML.safe_load_file(file)) : []
      map = {}
      groups.each do |group|
        terms = group.map { |term| normalize(term).squish }.uniq
        terms.each { |term| (map[term] ||= []).concat(terms - [ term ]).uniq! }
      end
      @synonyms = { mtime:, map: }
      map
    end

    # The words of the help center one slip away from `word`, or from its
    # beginning: « baisiere » finds « baissiere », « palete » « palettes ».
    def slips(word)
      articles = all
      @slips = { articles:, vocabulary: articles.flat_map { |a| a.send(:field_words).values.flat_map(&:to_a) }.to_set, found: {} } unless @slips && @slips[:articles].equal?(articles)
      found = @slips[:found]
      found.clear if found.size > 500
      found[word] ||= @slips[:vocabulary].select do |text|
        next false if text.length < word.length - 1
        distance(word, text) <= 1 || distance(word, text[0, word.length]) <= 1
      end.to_set
    end

    # Optimal string alignment distance, stopped early above `max` (the
    # same as app/frontend/quick_switcher/match.ts).
    def distance(a, b, max = 1)
      return max + 1 if (a.length - b.length).abs > max
      rows = [ (0..b.length).to_a ]
      (1..a.length).each do |i|
        rows[i] = [ i ]
        best = i
        (1..b.length).each do |j|
          cost = a[i - 1] == b[j - 1] ? 0 : 1
          value = [ rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost ].min
          value = [ value, rows[i - 2][j - 2] + 1 ].min if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]
          rows[i][j] = value
          best = value if value < best
        end
        return max + 1 if best > max
      end
      rows[a.length][b.length]
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

  def initialize(slug:, title:, summary:, category:, order:, markdown:, html: nil)
    @slug, @title, @summary, @category, @order, @markdown, @html = slug, title, summary, category, order, markdown, html
  end

  def html
    @html ||= HelpGlossary.annotate(action_links(rendered))
  end

  # The body as Markdown renders it, before the glossary and action links.
  def rendered
    @rendered ||= Commonmarker.to_html(markdown, options: MARKDOWN_OPTIONS, plugins: { syntax_highlighter: nil })
      .gsub(HEADING_ANCHOR, "")   # keep the heading ids, drop the English "Link to heading" anchors
  end

  # The editor panels a guide's buttons open: [Ouvrir le panneau Relief](action:panel/relief).
  def panel_actions
    rendered.scan(ACTION_LINK).flatten.uniq
  end

  # A panel link becomes a button: in the editor it opens the panel, elsewhere
  # it leads to the last map opened (components/help/actions.ts).
  def action_links(html)
    html.gsub(ACTION_LINK) { %(<a href="/maps" class="help-action" data-help-panel="#{$1}">) }
  end

  # Level-2 headings, for the "on this page" list: [{ id:, text: }].
  def headings
    @headings ||= html.scan(%r{<h2 id="([^"]+)">(.*?)</h2>}m).map { |id, text| { id:, text: ActionController::Base.helpers.strip_tags(text) } }
  end

  # Plain text of the body (no Markdown), for search and excerpts.
  def plain_text
    @plain_text ||= ActionController::Base.helpers.strip_tags(rendered).squish
  end

  # nil when a query word is missing, otherwise a relevance score. A word
  # matches the start of a word of the text (« plant » finds « plants »).
  def score(words)
    words.sum { |word| word_score(word) || (return nil) }
  end

  # A short passage of the body around the first matching word.
  def excerpt(words, length: 160)
    return summary if words.blank?
    haystack = self.class.normalize(plain_text)
    position = words.flat_map { |w| self.class.alternatives(w) }.filter_map { |w| haystack.index(/\b#{Regexp.escape(w)}/) }.min
    return summary if position.nil?
    start = [ position - 50, 0 ].max
    snippet = plain_text[start, length].to_s
    "#{'…' if start.positive?}#{snippet}#{'…' if start + length < plain_text.length}"
  end

  def as_json(*)
    { slug:, title:, summary:, category:, url: "/help/#{slug}" }
  end

  # The other guides of its category, in order.
  def related
    self.class.all.select { |article| article.category == category && article != self }
  end

  def to_drawer_json
    as_json.merge(html:, headings:, related: related.map(&:as_json))
  end

  private
    WEIGHTS = { title: 10, summary: 4, category: 2 }.freeze
    SLIP_MIN_LENGTH = 4

    def normalized_fields
      @normalized_fields ||= { title:, summary:, category:, body: plain_text }.transform_values { |text| self.class.normalize(text) }
    end

    def field_words
      @field_words ||= normalized_fields.transform_values { |text| text.scan(/[a-z0-9]{2,}/).to_set }
    end

    def word_score(word)
      exact = self.class.alternatives(word).sum do |term|
        pattern = /\b#{Regexp.escape(term)}/
        WEIGHTS.sum { |field, weight| normalized_fields[field].match?(pattern) ? weight : 0 } +
          [ normalized_fields[:body].scan(pattern).size, 5 ].min
      end
      return exact if exact.positive?
      return nil if word.length < SLIP_MIN_LENGTH
      near = self.class.slips(word)
      slip = WEIGHTS.merge(body: 1).sum do |field, weight|
        field_words[field].intersect?(near) ? (weight / 2.0).ceil : 0
      end
      slip.positive? ? slip : nil
    end
end
