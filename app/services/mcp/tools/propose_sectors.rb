module Mcp
  module Tools
    # Sector analysis as drafts: the AI names each influence that comes onto
    # the terrain from outside (winds, fire, flooding, noise, views…) and the
    # directions it comes from; Terranova draws its arc around the terrain
    # (Sectors::Arc), so the AI never computes geometry, and the arcs, which
    # run a little outside the terrain, skip the boundary check. The drafts are
    # `sector` notes, reviewed like any other in the editor. The sun sectors
    # are not proposed: the editor draws them from the latitude.
    class ProposeSectors < Base
      MAX_SECTORS = 30

      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          summary: { type: "string", maxLength: 1000, description: :summary },
          sectors: {
            type: "array", minItems: 1, maxItems: MAX_SECTORS, description: :sectors,
            items: {
              type: "object", additionalProperties: false,
              required: %w[sector_type from_deg to_deg rationale],
              properties: {
                sector_type: { type: "string", enum: Sectors::Arc::TYPES, description: :sector_type },
                from_deg: { type: "number", minimum: 0, maximum: 360, description: :from_deg },
                to_deg: { type: "number", minimum: 0, maximum: 360, description: :to_deg },
                season: { type: "string", enum: Sectors::Arc::SEASONS, default: "all_year", description: :season },
                name: { type: "string", maxLength: 60, description: :sector_name },
                notes: { type: "string", maxLength: 2000, description: :sector_notes },
                rationale: { type: "string", minLength: 10, maxLength: 2000, description: :sector_rationale }
              }
            }
          }
        },
        required: %w[map_id sectors]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, sectors:, summary: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        raise ToolError, I18n.t("mcp.errors.no_boundary") if map.boundary.nil? || map.center.nil?

        # Items keep their index in DraftProposal's answer, so a refused
        # sector is reported under the number the AI sent it with.
        items, positions, rejected = [], [], []
        sectors.each_with_index do |sector, index|
          if (error = item_error(sector))
            rejected << { index:, error: }
          else
            items << draft_item(map, sector)
            positions << index
          end
        end
        outcome = items.any? ? DraftProposal.new(map:, user:, placed_by_terranova: true).call(items) : DraftProposal::Outcome.new(created: [], rejected: [])
        rejected += outcome.rejected.map { |r| r.merge(index: positions[r[:index]]) }
        rejected.sort_by! { |r| r[:index] }
        created = outcome.created.map { |c| c.merge(index: positions[c[:index]]) }
        if created.empty?
          details = rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; ")
          raise ToolError, t("errors.nothing_created", details:)
        end
        {
          created: created.map { |c| { index: c[:index], id: c[:feature].id, layer: c[:feature].layer, kind: c[:feature].kind, name: c[:feature].name, sector_type: c[:feature].properties["sector_type"] }.compact },
          rejected:,
          pending_drafts: map.features.drafts.count,
          review_url: map_url(map),
          next_step: t("notes.review_sectors")
        }
      end

      private
        # The JSON Schema already holds the server to these; a direct call
        # (tests, another tool) gets the same answer, item by item.
        def item_error(sector)
          return I18n.t("mcp.draft_errors.not_an_object") unless sector.is_a?(Hash)
          return t("sector_errors.type", types: Sectors::Arc::TYPES.join(", ")) unless Sectors::Arc::TYPES.include?(sector[:sector_type].to_s)
          return t("sector_errors.season", seasons: Sectors::Arc::SEASONS.join(", ")) if sector[:season] && !Sectors::Arc::SEASONS.include?(sector[:season].to_s)
          t("sector_errors.direction") unless [ sector[:from_deg], sector[:to_deg] ].all? { |deg| deg.is_a?(Numeric) && deg.between?(0, 360) }
        end

        def draft_item(map, sector)
          type = sector[:sector_type].to_s
          {
            layer: "notes", kind: "sector",
            geometry: Sectors::Arc.for_map(map, from_deg: sector[:from_deg], to_deg: sector[:to_deg]),
            name: sector[:name].to_s.strip.first(60).presence,
            notes: sector[:notes],
            color: Sectors::Arc::COLORS.fetch(type),
            rationale: sector[:rationale],
            properties: {
              sector_type: type, sector_season: (sector[:season] || "all_year").to_s,
              from_deg: sector[:from_deg], to_deg: sector[:to_deg]
            }
          }
        end

        def summarize_arguments(arguments)
          list = Array(arguments[:sectors])
          {
            map_id: arguments[:map_id], summary: arguments[:summary].to_s.first(1000).presence,
            sectors: list.size,
            types: list.group_by { |s| s.is_a?(Hash) ? s[:sector_type].to_s : "?" }.transform_values(&:size)
          }.compact
        end

        def summarize_result(data)
          { created: data[:created].size, rejected: data[:rejected].size, feature_ids: data[:created].map { |c| c[:id] } }
        end
    end
  end
end
