# « Palette végétale »: the table of a map's plants, next to the map, the
# project sheet and the tasks. Everyone on the map reads it; editors save
# views and set a plant's role, price, supplier and size (its palette item,
# created on the fly for a plant drawn but not yet in the palette), one
# plant at a time or for a whole selection (batch, undone by undo_batch).
module Maps
  class PlantPalettesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, only: %i[update_plant batch undo_batch]

    def show
      palette = PlantPalette.new(@map)
      respond_to do |format|
        format.html do
          render inertia: "maps/plant_palettes/show", props: palette.as_json.merge(
            map: { id: @map.id, name: @map.name, role: @role, teamId: @map.organization_id,
                   offerBuilder: Offer.shown_to?(@map, Current.user), country: @map.country_code, areaM2: @map.area_m2 },
            views: @map.plant_palette_views.map(&:as_json),
            presets: PlantPaletteView.presets_json,
            schema: { columns: PlantPaletteView::COLUMNS, groups: PlantPaletteView::GROUPS },
            canEdit: can_edit?,
            # A plant's name opens the editor's own sheet of it (palette/PlantFeatureSheet).
            editorMap: @map.as_inertia(Current.user).merge(readOnlyByPlan: @map.read_only_by_plan?),
            mapEntitlements: map_entitlements.as_json
          )
        end
        format.json { render json: palette }
      end
    end

    # The plant's life on this land, for its sheet.
    def plant
      details = PlantPalette.new(@map).details(params[:key])
      return head(:not_found) unless details
      render json: details
    end

    def update_plant
      species_id, variety_id = parse_key(params[:key])
      return render(json: { message: t("plant_palette.errors.not_in_catalogue") }, status: :unprocessable_entity) unless species_id

      item = @map.palette_items.find_or_initialize_by(species_id:, variety_id:)
      item.created_by ||= Current.user
      if item.update(plant_params)
        render json: PlantPalette.new(@map)
      else
        render_errors item
      end
    end

    # Actions on the selection of either table (PlantPalette::Batch).
    def batch
      selection = params.require(:batch)
      result = PlantPalette::Batch.new(
        @map, keys: selection[:keys], plant_ids: selection[:plant_ids], change: selection[:change], value: selection[:value], by: Current.user
      ).run!
      render json: PlantPalette.new(@map.reload).as_json.merge(result)
    rescue PlantPalette::Batch::Invalid => e
      render json: { message: e.message }, status: :unprocessable_entity
    end

    def undo_batch
      PlantPalette::Batch.new(@map, by: Current.user).undo!(params.require(:undo).to_unsafe_h)
      render json: PlantPalette.new(@map.reload)
    rescue PlantPalette::Batch::Invalid => e
      render json: { message: e.message }, status: :unprocessable_entity
    end

    private
      def can_edit?
        %w[owner editor].include?(@role) && !@map.read_only_by_plan?
      end

      def parse_key(key)
        species, variety = key.to_s.split("-", 2)
        return [ nil, nil ] unless species.to_s.match?(/\A\d+\z/) && PlantSpecies.exists?(species.to_i)
        [ species.to_i, variety.to_s.match?(/\A\d+\z/) ? variety.to_i : nil ]
      end

      def plant_params
        params.require(:plant).permit(:role, :notes, :target_count, :unit_price, :supplier, :size, :strata)
      end
  end
end
