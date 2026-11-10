module Mcp
  module Tools
    # What the user's AI found on a territory, proposed as drafts of its
    # dossier: people already at work there, sources (link, author, date,
    # rights, excerpts), the territory's own expectations, dated markers
    # with their proof, layout leads. Each comes with its rationale; a person
    # keeps or rejects it on the territory's page. Terranova never searches
    # the web itself: the AI does, and says where each find comes from.
    class ProposeTerritoryItems < Base
      include TerritoryAccess

      MAX_ITEMS = 40

      requirement :propose
      arguments(
        properties: {
          territory_id: { type: "integer", minimum: 1, description: :territory_id },
          items: {
            type: "array", minItems: 1, maxItems: MAX_ITEMS, description: :territory_items,
            items: {
              type: "object", additionalProperties: false, required: %w[kind title rationale],
              properties: {
                kind: { type: "string", enum: TerritoryItem::KINDS, description: :territory_item_kind },
                title: { type: "string", minLength: 2, maxLength: TerritoryItem::TITLE_MAX_LENGTH, description: :territory_item_title },
                body: { type: "string", maxLength: 6000, description: :territory_item_body },
                rationale: { type: "string", minLength: 10, maxLength: 3000, description: :territory_item_rationale },
                geometry: { type: "object", description: :territory_item_geometry },
                properties: { type: "object", description: :territory_item_properties }
              }
            }
          }
        },
        required: %w[territory_id items]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(territory_id:, items:)
        territory = find_territory!(territory_id)
        require_drafts_scope!
        require_territory_editor!(territory)

        existing = territory.items.not_rejected.to_a
        created, rejected = [], []
        items.each_with_index do |raw, index|
          raw = raw.to_h.deep_stringify_keys
          if (twin = duplicate_of(existing, raw))
            rejected << { index:, error: t("errors.territory_duplicate", id: twin.id) }
            next
          end
          item = territory.items.new(kind: raw["kind"], status: "draft", source: "ai", created_by: user,
                                     title: raw["title"], body: raw["body"], rationale: raw["rationale"], properties: raw["properties"] || {})
          begin
            item.geometry = raw["geometry"] if raw["geometry"].present?
          rescue RGeo::Error::ParseError, JSON::ParserError, NoMethodError
            rejected << { index:, error: t("errors.territory_geometry") }
            next
          end
          if item.save
            existing << item
            created << { index:, id: item.id, kind: item.kind, title: item.title }
          else
            rejected << { index:, error: item.errors.full_messages.to_sentence }
          end
        end
        raise ToolError, t("errors.nothing_created", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; ")) if created.empty?
        { created:, rejected:, review_url: territory_url(territory), next_step: t("notes.review_territory_items") }
      end

      private
        # The same find twice: same kind and title, or a source with the same link.
        def duplicate_of(existing, raw)
          title = raw["title"].to_s.squish.downcase
          url = raw.dig("properties", "url").to_s.strip.presence
          existing.find do |item|
            next false unless item.kind == raw["kind"]
            item.title.downcase == title || (url && item.kind == "source" && item.prop(:url) == url)
          end
        end

        def summarize_arguments(arguments)
          { territory_id: arguments[:territory_id], items: Array(arguments[:items]).size }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end
