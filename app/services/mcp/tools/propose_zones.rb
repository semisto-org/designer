module Mcp
  module Tools
    # Permaculture zones as drafts: Terranova draws zones 1 to 4 around the
    # house (PermacultureZones::Proposal, the same rings as the editor's
    # « Zones » panel), so the AI never computes geometry. The house is the
    # building the AI names, else the one marked as the dwelling. Zone 5, the
    # wild part, is the person's choice: the AI proposes it with
    # propose_features when the person has said where. A terrain that has
    # zones already gets none: they are changed with propose_feature_updates.
    class ProposeZones < Base
      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          house_id: { type: "integer", minimum: 1, description: :house_id },
          summary: { type: "string", maxLength: 1000, description: :summary },
          rationale: { type: "string", minLength: 10, maxLength: 2000, description: :zones_rationale }
        },
        required: %w[map_id rationale]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, rationale:, house_id: nil, summary: nil)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        raise ToolError, I18n.t("mcp.errors.no_boundary") if map.boundary.nil?
        raise ToolError, t("zone_errors.already") if map.features.active.where(kind: PermacultureZones::Lookup::KIND).exists?

        houses = house_id ? [ named_house(map, house_id) ] : map.features.active.where(kind: "building").select { |b| b.properties["dwelling"] == true }
        raise ToolError, t("zone_errors.no_house") if houses.empty?

        zones = PermacultureZones::Proposal.new(map, houses:).call
        raise ToolError, t("zone_errors.nothing") if zones.empty?

        items = zones.map do |zone|
          {
            layer: "notes", kind: PermacultureZones::Lookup::KIND, geometry: zone[:geometry], rationale:,
            color: PermacultureZones::Proposal::COLORS.fetch(zone[:number]),
            properties: { zone_number: zone[:number] }
          }
        end
        outcome = DraftProposal.new(map:, user:, placed_by_terranova: true).call(items)
        raise ToolError, t("errors.nothing_created", details: outcome.rejected.first(5).map { |r| r[:error] }.join(" ; ")) if outcome.created.empty?

        {
          created: outcome.created.map { |c| { id: c[:feature].id, zone_number: c[:feature].properties["zone_number"] } },
          areas_m2: zones.group_by { |z| z[:number] }.transform_values { |list| list.sum { |z| z[:area_m2] }.round },
          house_ids: houses.map(&:id),
          house_marked: houses.all? { |h| h.properties["dwelling"] == true },
          pending_drafts: map.features.drafts.count,
          review_url: map_url(map),
          next_step: t("notes.review_zones")
        }
      end

      private
        def named_house(map, id)
          house = map.features.active.find_by(id:, kind: "building")
          raise ToolError, t("zone_errors.house", id:) unless house
          house
        end

        def summarize_arguments(arguments) = arguments.slice(:map_id, :house_id).merge(summary: arguments[:summary].to_s.first(1000).presence).compact

        def summarize_result(data)
          { created: data[:created].size, feature_ids: data[:created].map { |c| c[:id] } }
        end
    end
  end
end
