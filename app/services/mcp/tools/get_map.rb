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
          area_m2: map.area_m2 || (map.boundary && map.measure_geometry(:boundary)["area"]),
          centroid: centroid(map),
          bbox: map.bbox&.map { |v| v.round(Geo::PRECISION) },
          boundary: Geo.encode(map.boundary),
          parcels: map.parcels,
          project: map.project,
          elements: element_counts(map),
          tags: tag_counts(map),
          palette: palette(map),
          palette_drafts_pending: map.palette_drafts.count,
          known_kinds: I18n.t("editor.kinds", default: {}),
          layers: MapFeature::LAYERS.index_with { |layer| I18n.t("editor.layers.#{layer}", default: layer) },
          permissions: {
            read: true,
            propose_drafts: blockers.empty?,
            propose_drafts_blocked_by: blockers.map { |b| t("permissions.#{b}") },
            drafts_trial_ends_at: entitlements.ai_trial_ends_at&.iso8601,
            drafts_trial_note: trial_note(entitlements)
          }.compact,
          limits: {
            max_features_per_proposal: DraftProposal::MAX_FEATURES,
            max_pending_drafts: DraftProposal::MAX_PENDING,
            proposal_buffer_m: DraftProposal::BUFFER_M,
            max_plants_per_palette_proposal: PaletteProposal::MAX_PLANTS
          }
        }
      end

      private
        # The species chosen for this terrain (accepted entries only).
        def palette(map)
          map.palette_items.includes(species: :common_names, variety: :common_names).map do |item|
            {
              id: item.id, species_id: item.species_id, variety_id: item.variety_id, name: item.display_name,
              latin_name: item.variety&.full_latin_name || item.species.latin_name,
              strata: item.effective_strata, role: item.role, target_count: item.target_count, notes: item.notes
            }.compact
          end
        end

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

        # The map's tags (shared by all its elements) and how many elements carry each.
        def tag_counts(map)
          scope = map.features.where.not(status: "rejected")
          scope = scope.where.not(layer: "networks") unless editor?
          scope.tag_counts
        end

        # The owner is trying drafts on the free plan: say until when, so
        # Claude can warn the user before the trial ends.
        def trial_note(entitlements)
          return unless entitlements.ai_trial?
          date = I18n.l(entitlements.ai_trial_ends_at.in_time_zone.to_date, format: :long)
          t("notes.drafts_trial", date:)
        end

        def summarize_result(data) = { elements: data[:elements][:total_active], drafts: data[:elements][:drafts_pending] }
    end
  end
end
