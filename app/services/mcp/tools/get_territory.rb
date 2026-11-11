module Mcp
  module Tools
    # A territory whole: the commune's boundary, the region's layers that can
    # be read there, the team's maps inside it, its dossier (people met,
    # sources, expectations, sub-basins, markers, leads, requests, drafts and
    # pending changes included), the research
    # grid of its region and the rules of the « carnet du territoire ».
    class GetTerritory < Base
      include TerritoryAccess

      arguments(
        properties: { territory_id: { type: "integer", minimum: 1, description: :territory_id } },
        required: %w[territory_id]
      )
      hints(read_only: true, idempotent: true)

      def perform(territory_id:)
        territory = find_territory!(territory_id)
        items = territory.items.not_rejected.with_attached_file.includes(:pending_update).order(:kind, :created_at).to_a
        {
          id: territory.id, name: territory.name, team: territory.organization.name,
          area_km2: (territory.area_m2 / 1_000_000).round(2), bbox: territory.bbox,
          center: [ territory.center.x, territory.center.y ],
          boundary: Geo.encode(territory.boundary), boundary_source: territory.boundary_source,
          region: territory.region&.name, archived: territory.archived?, editable: territory.editable_by?(user),
          layers: territory.readable_layers.map { |layer| { key: layer.key, name: layer.name, group: layer.group_name, category: layer.category } },
          team_maps: territory.team_maps.map { |map| { id: map.id, name: map.name, area_m2: map.area_m2&.round, url: map_url(map) } },
          dossier: TerritoryItem::KINDS.index_with { |kind| items.select { |item| item.kind == kind }.map { |item| item_json(item) } },
          notebook: territory.notebook,
          research_grid: territory.research_grid,
          values: {
            proof: TerritoryItem::PROOFS, marker_kind: TerritoryItem::MARKER_KINDS, source_kind: TerritoryItem::SOURCE_KINDS,
            rights: TerritoryItem::RIGHTS, rank: TerritoryItem::RANKS, theme: TerritoryItem::THEMES, land: TerritoryItem::LANDS,
            farmer_answer: TerritoryItem::FARMER_ANSWERS, decision: TerritoryItem::DECISIONS,
            request_kind: TerritoryItem::REQUEST_KINDS, request_state: TerritoryItem::REQUEST_STATES
          },
          properties_by_kind: TerritoryItem::SCHEMA.transform_values { |schema| schema_keys(schema) },
          rules: t("notes.territory_rules"),
          url: territory_url(territory),
          notebook_urls: { working: "#{territory_url(territory)}/notebook", public: "#{territory_url(territory)}/notebook?version=public" }
        }
      end

      private
        # Each kind's keys, with their type or allowed values.
        def schema_keys(schema)
          schema.transform_values do |type|
            case type
            when Hash then schema_keys(type)
            when Array then type
            else type.to_s
            end
          end
        end

        def summarize_arguments(arguments) = { territory_id: arguments[:territory_id] }
        def summarize_result(data) = { territory_id: data[:id], items: data[:dossier].values.sum(&:size) }
    end
  end
end
