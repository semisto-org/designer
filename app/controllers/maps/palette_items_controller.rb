# The palette of a map: species and cultivars chosen for its design.
# Writes answer with the refreshed planting state.
module Maps
  class PaletteItemsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: %i[index suggestions]
    before_action :set_item, only: %i[update destroy]

    def index
      render json: { items: @map.palette_items.includes(species: :common_names, variety: %i[common_names species]).map(&:as_json) }
    end

    def suggestions
      render json: PaletteSuggestions.new(@map)
    end

    def create
      item = @map.palette_items.new(item_params.merge(created_by: Current.user))
      if item.save
        render json: { item:, planting: PlantingState.new(@map) }, status: :created
      else
        render_errors item
      end
    end

    def update
      if @item.update(item_params.except(:species_id, :variety_id))
        render json: { item: @item, planting: PlantingState.new(@map) }
      else
        render_errors @item
      end
    end

    # Removing a species from the palette leaves the plants already drawn.
    def destroy
      @item.destroy!
      render json: { planting: PlantingState.new(@map) }
    end

    private
      def set_item
        @item = @map.palette_items.find(params[:id])
      end

      def item_params
        params.require(:palette_item).permit(:species_id, :variety_id, :strata, :role, :notes, :target_count)
      end
  end
end
