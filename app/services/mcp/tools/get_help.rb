module Mcp
  module Tools
    # Terranova's own user guide (the help center, app/help): where to click
    # and what each screen does, so any AI can walk the person through the
    # app, citing the guide. The design method itself is get_design_guide.
    class GetHelp < Base
      SEARCH_LIMIT = 8

      arguments(
        properties: {
          slug: { type: "string", description: :slug },
          query: { type: "string", description: :query }
        }
      )
      hints

      def perform(slug: nil, query: nil)
        return article(slug) if slug.present?
        return search(query) if query.present?
        { guides: HelpArticle.all.map { |a| index_json(a) }, url: "#{origin}/help" }
      end

      private
        def article(slug)
          found = HelpArticle.find(HelpArticle.renamed_to(slug) || slug) || raise(ToolError, t("errors.help_not_found", slug:))
          { slug: found.slug, title: found.title, summary: found.summary, category: found.category,
            guide: readable(found.markdown), url: "#{origin}/help/#{found.slug}",
            related: found.related.map { |a| index_json(a) } }
        end

        def search(query)
          words = HelpArticle.tokenize(query)
          { query:, guides: HelpArticle.search(query).first(SEARCH_LIMIT).map { |a| index_json(a).merge(excerpt: a.excerpt(words)) } }
        end

        def index_json(article)
          { slug: article.slug, title: article.title, summary: article.summary, category: article.category }
        end

        # The guide's Markdown, with its links made absolute and its panel
        # buttons turned into words an assistant can repeat.
        def readable(markdown)
          markdown
            .gsub(%r{\[([^\]]+)\]\(action:panel/[a-z0-9-]+\)}) { "**#{$1}** (#{t('notes.help_panel_button')})" }
            .gsub(%r{!\[([^\]]*)\]\(/help/captures/[^)]+\)}) { $1.present? ? "(#{t('notes.help_capture', alt: $1)})" : "" }
            .gsub(%r{\]\(/}) { "](#{origin}/" }
        end

        def summarize_result(data) = data[:slug] ? { slug: data[:slug] } : { guides: data[:guides].size }
    end
  end
end
