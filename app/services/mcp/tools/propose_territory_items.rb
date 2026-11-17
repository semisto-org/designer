module Mcp
  module Tools
    # What the user's AI found on a territory, proposed as drafts of its
    # dossier: people already at work there, sources (link, author, date,
    # rights, excerpts), the territory's own expectations, dated markers
    # with their proof, layout leads. Each comes with its rationale; a person
    # keeps or rejects it on the territory's page. Terranova never searches
    # the web itself: the AI does, and says where each find comes from.
    #
    # A draft can point to another draft of the same call: it names itself
    # with `ref`, and the other uses basin_ref, actor_ref, source_ref,
    # source_refs or expectation_refs in its properties. Drafts are created
    # in the order their references allow.
    #
    # A basin can name its official sectors (`paris_sector_ids`): the server
    # attaches their outline, merged into one for a valley of several, and
    # its area, instead of the AI copying tens of thousands of coordinates.
    # A marker or a lead placed without basin_id gets the basin of the
    # dossier its place falls in (`basin_id_auto` in the answer).
    class ProposeTerritoryItems < Base
      include TerritoryAccess

      MAX_ITEMS = 40
      # A reference to a draft of the same call, and the key it fills.
      REFS = { "basin_ref" => "basin_id", "actor_ref" => "actor_id", "source_ref" => "source_id",
               "confirm_with_ref" => "confirm_with_id", "verified_by_ref" => "verified_by_id" }.freeze
      REF_LISTS = { "source_refs" => "source_ids", "expectation_refs" => "expectation_ids" }.freeze

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
                ref: { type: "string", minLength: 1, maxLength: 40, pattern: "^[A-Za-z0-9_.-]+$", description: :territory_item_ref },
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
        queue = items.each_with_index.map { |raw, index| [ index, raw.to_h.deep_stringify_keys ] }
        declared = {}
        queue.reject! do |index, raw|
          ref = raw["ref"]
          next false if ref.nil?
          next false unless declared.key?(ref)
          rejected << { index:, error: t("errors.territory_ref_twice", ref:) }
        end
        queue.each { |index, raw| declared[raw["ref"]] ||= index if raw["ref"] }
        resolved, failed = {}, Set.new

        until queue.empty?
          basins_left = queue.any? { |_, raw| raw["kind"] == "basin" }
          ready, waiting = queue.partition do |_, raw|
            refs_of(raw).all? { |ref| resolved.key?(ref) || failed.include?(ref) || !declared.key?(ref) } &&
              !(basins_left && raw["kind"] != "basin" && auto_basin?(raw))
          end
          ready.sort_by! { |_, raw| raw["kind"] == "basin" ? 0 : 1 }
          # A cycle: what is left waits on itself.
          ready, waiting = waiting, [] if ready.empty?
          ready.each do |index, raw|
            result = propose(territory, existing, raw, resolved, failed, declared)
            if result.is_a?(TerritoryItem)
              existing << result
              resolved[raw["ref"]] = result.id if raw["ref"]
              created << { index:, id: result.id, kind: result.kind, title: result.title, ref: raw["ref"],
                           basin_id_auto: @auto_basins&.delete(result.id), outline: (@official_outlines&.delete(result.id)) }.compact
            else
              failed << raw["ref"] if raw["ref"]
              rejected << { index:, error: result }
            end
          end
          queue = waiting
        end
        created.sort_by! { |c| c[:index] }
        rejected.sort_by! { |r| r[:index] }
        raise ToolError, t("errors.nothing_created", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; ")) if created.empty?
        { created:, rejected:, review_url: territory_url(territory), next_step: t("notes.review_territory_items") }
      end

      private
        # Creates one draft, its references to other drafts of the call
        # replaced by their ids. Returns the item, or the reason it was not.
        def propose(territory, existing, raw, resolved, failed, declared)
          properties, error = resolve_refs(raw["properties"], resolved, failed, declared)
          return error if error
          raw = raw.merge("properties" => properties)
          if (twin = duplicate_of(existing, raw))
            return t("errors.territory_duplicate", id: twin.id)
          end
          official = nil
          if raw["kind"] == "basin" && properties["paris_sector_ids"].present?
            official, error = official_outline(territory, properties["paris_sector_ids"])
            return error if error

            raw = raw.merge("geometry" => official[:geometry])
            properties = properties.merge("paris_sector_ids" => official[:sector_ids], "area_km2" => official[:area_km2])
          end
          item = territory.items.new(kind: raw["kind"], status: "draft", source: "ai", created_by: user,
                                     title: raw["title"], body: raw["body"], rationale: raw["rationale"], properties:)
          begin
            item.geometry = raw["geometry"] if raw["geometry"].present?
          rescue RGeo::Error::ParseError, JSON::ParserError, NoMethodError
            return t("errors.territory_geometry")
          end
          auto = auto_basin?(raw) && item.geometry && territory.basins_at(geometry: item.geometry).first
          item.properties = item.properties.merge("basin_id" => auto.id) if auto
          return item.errors.full_messages.to_sentence unless item.save

          (@auto_basins ||= {})[item.id] = auto.id if auto
          (@official_outlines ||= {})[item.id] = { sector_ids: official[:sector_ids], area_km2: official[:area_km2], inside_km2: official[:inside_km2] } if official
          item
        end

        # A marker or a lead with a place and no sub-basin given.
        def auto_basin?(raw)
          return false unless %w[marker lead].include?(raw["kind"]) && raw["geometry"].present?

          properties = raw["properties"].is_a?(Hash) ? raw["properties"] : {}
          !properties.key?("basin_id") && !properties.key?("basin_ref")
        end

        # [outline, nil] or [nil, error]: the official contour of these
        # sectors, merged, from the region's water authority.
        def official_outline(territory, ids)
          @hydrography ||= TerritoryHydrography.new(territory)
          return [ nil, t("errors.hydrography_not_configured") ] unless @hydrography.available?

          outline = @hydrography.outline_of(ids)
          return [ nil, t("errors.territory_sectors_missing", ids: outline[:missing].join(", ")) ] if outline[:missing].any?

          [ outline, nil ]
        rescue TerritoryHydrography::Unavailable
          [ nil, t("errors.hydrography_unavailable") ]
        end

        def refs_of(raw)
          properties = raw["properties"].is_a?(Hash) ? raw["properties"] : {}
          REFS.keys.filter_map { |key| properties[key]&.to_s } + REF_LISTS.keys.flat_map { |key| Array(properties[key]).map(&:to_s) }
        end

        def resolve_refs(properties, resolved, failed, declared)
          properties = properties.is_a?(Hash) ? properties.dup : {}
          lookup = lambda do |ref|
            ref = ref.to_s
            return [ resolved[ref], nil ] if resolved.key?(ref)
            return [ nil, t("errors.territory_ref_failed", ref:) ] if failed.include?(ref) || declared.key?(ref)
            [ nil, t("errors.territory_ref_unknown", ref:) ]
          end
          REFS.each do |key, target|
            next unless properties.key?(key)
            id, error = lookup.(properties.delete(key))
            return [ nil, error ] if error
            properties[target] = id
          end
          REF_LISTS.each do |key, target|
            next unless properties.key?(key)
            ids = []
            Array(properties.delete(key)).each do |ref|
              id, error = lookup.(ref)
              return [ nil, error ] if error
              ids << id
            end
            properties[target] = (Array(properties[target]) + ids).uniq
          end
          [ properties, nil ]
        end

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
