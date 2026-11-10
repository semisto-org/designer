module Mcp
  module Tools
    # Notes the budget data of the « Palette végétale », as a person types it
    # in its Budget view: unit price, size (calibre), supplier and the number
    # of plants aimed at. Purchasing, not design: the species, strata and
    # role stay the human's (propose_palette, propose_feature_updates).
    # A line names a palette entry by its id, or a species (and cultivar)
    # drawn on the map but not yet in the palette, whose entry is created on
    # the fly like PlantPalettesController#update_plant does. Only the fields
    # passed change; null clears one.
    class UpdatePaletteBudget < Base
      Invalid = Class.new(StandardError)

      requirement :write
      MAX_ITEMS = 200
      FIELDS = %w[unit_price size supplier target_count].freeze

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          items: {
            type: "array", minItems: 1, maxItems: MAX_ITEMS, description: :palette_budget_changes,
            items: {
              type: "object", additionalProperties: false, minProperties: 2,
              properties: {
                palette_item_id: { type: "integer", minimum: 1, description: :palette_item_id },
                species_id: { type: "integer", minimum: 1, description: :budget_species_id },
                variety_id: { type: "integer", minimum: 1, description: :budget_variety_id },
                unit_price: { type: [ "number", "null" ], minimum: 0, maximum: 99_999.99, description: :unit_price },
                size: { type: [ "string", "null" ], maxLength: 60, description: :plant_size },
                supplier: { type: [ "string", "null" ], maxLength: 120, description: :supplier },
                target_count: { type: [ "integer", "null" ], minimum: 1, maximum: 999_999, description: :budget_target_count }
              }
            }
          }
        },
        required: %w[map_id items]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, items:)
        map = find_map!(map_id)
        require_write!(map)
        updated = []
        rejected = []
        items.each_with_index do |line, index|
          line = line.to_h.transform_keys(&:to_s)
          ref = line.slice("palette_item_id", "species_id", "variety_id")
          item = find_item(map, line)
          changes = line.slice(*FIELDS)
          raise Invalid, t("errors.palette_budget_no_change") if changes.empty?
          item.created_by ||= user
          item.update!(changes)
          updated << item
        rescue Invalid => e
          rejected << { index:, **ref.symbolize_keys, error: e.message }
        rescue ActiveRecord::RecordInvalid => e
          rejected << { index:, **ref.symbolize_keys, error: e.record.errors.full_messages.to_sentence }
        end
        if updated.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        {
          updated: updated.uniq.map do |item|
            { id: item.id, species_id: item.species_id, variety_id: item.variety_id, name: item.display_name,
              unit_price_eur: item.unit_price&.to_f, size: item.size, supplier: item.supplier, target_count: item.target_count }.compact
          end,
          rejected:,
          url: "#{map_url(map)}/palette"
        }
      end

      private
        # The palette entry a line names. Drafts wait for the human: they
        # are never priced from here.
        def find_item(map, line)
          if line["palette_item_id"]
            item = map.palette_items.find_by(id: line["palette_item_id"])
            raise Invalid, t("errors.palette_item_not_found", id: line["palette_item_id"]) unless item && !item.draft?
            return item
          end
          raise Invalid, t("errors.palette_budget_needs_target") unless line["species_id"]
          species = PlantSpecies.find_by(id: line["species_id"]) or raise Invalid, t("errors.palette_budget_species_not_found", id: line["species_id"])
          if line["variety_id"] && !species.varieties.exists?(id: line["variety_id"])
            raise Invalid, t("errors.palette_budget_variety_not_found", id: line["variety_id"])
          end
          item = map.palette_items.find_or_initialize_by(species_id: species.id, variety_id: line["variety_id"])
          raise Invalid, t("errors.palette_item_not_found", id: item.id) if item.draft?
          item
        end

        def summarize_arguments(arguments) = { map_id: arguments[:map_id], items: Array(arguments[:items]).size }
        def summarize_result(data) = { updated: data[:updated].size, rejected: data[:rejected].size }
    end
  end
end
