module Mcp
  module Tools
    class GetMap < Base
      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        entitlements = Entitlements.for_map(map)
        blockers = []
        blockers << "scope" unless principal.drafts?
        blockers << "role" unless editor?
        blockers << "plan" unless entitlements.ai_drafts?
        blockers << "boundary" if map.boundary.nil?
        {
          id: map.id, name: map.name, description: map.description, address: map.address, url: map_url(map),
          role: @role, stage: map.stage, stage_label: I18n.t("maps.stages.#{map.stage}", default: map.stage),
          region: { key: map.region.key, name: map.region.name, country_code: map.region.country_code },
          area_m2: map.area_m2,
          centroid: centroid(map),
          bbox: map.bbox&.map { |v| v.round(Geo::PRECISION) },
          boundary: Geo.encode(map.boundary),
          parcels: map.parcels,
          project: map.project,
          elements: element_counts(map),
          known_kinds: I18n.t("editor.kinds", default: {}),
          layers: MapFeature::LAYERS.index_with { |layer| I18n.t("editor.layers.#{layer}", default: layer) },
          permissions: {
            read: true,
            propose_drafts: blockers.empty?,
            propose_drafts_blocked_by: blockers.map { |b| t("permissions.#{b}") }
          },
          limits: {
            max_features_per_proposal: DraftProposal::MAX_FEATURES,
            max_pending_drafts: DraftProposal::MAX_PENDING,
            proposal_buffer_m: DraftProposal::BUFFER_M
          }
        }
      end

      private
        def centroid(map)
          point = map.center || map.boundary&.centroid
          point && [ point.x.round(Geo::PRECISION), point.y.round(Geo::PRECISION) ]
        end

        def element_counts(map)
          counts = map.features.where.not(status: "rejected").group(:layer, :status).count
          counts = counts.reject { |(layer, _), _| layer == "networks" } unless editor?
          by_layer = counts.each_with_object({}) do |((layer, status), n), acc|
            (acc[layer] ||= { "active" => 0, "draft" => 0 })[status] = n
          end
          {
            by_layer:,
            total_active: counts.sum { |(_, status), n| status == "active" ? n : 0 },
            drafts_pending: counts.sum { |(_, status), n| status == "draft" ? n : 0 },
            hidden_layers: [ "networks" ],
            hidden_note: t(editor? ? "notes.networks_on_request" : "notes.networks_hidden")
          }
        end

        def summarize_result(data) = { elements: data[:elements][:total_active], drafts: data[:elements][:drafts_pending] }
    end
  end
end
