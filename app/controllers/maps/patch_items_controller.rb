# Composition of a patch (a MapFeature of kind "patch"): species or
# cultivars at a density (plants/m²) or as a count. Writes answer with the
# refreshed planting state, whose quantities follow the patch area.
module Maps
  class PatchItemsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_patch
    before_action :set_item, only: %i[update destroy]

    def index
      render json: { items: @patch.patch_items.map(&:as_json) }
    end

    def create
      item = @patch.patch_items.new(item_params)
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

    def destroy
      @item.destroy!
      render json: { planting: PlantingState.new(@map) }
    end

    private
      def set_patch
        @patch = @map.features.find_by!(id: params[:feature_id], kind: PlantableFeature::PATCH)
      end

      def set_item
        @item = @patch.patch_items.find(params[:id])
      end

      def item_params
        params.require(:patch_item).permit(:species_id, :variety_id, :strata, :density, :count)
      end
  end
end
