# The palette of a map: species and cultivars chosen for its design, and the
# drafts an AI proposed for it (accepted or refused one by one, or all at
# once). Writes answer with the refreshed planting state.
module Maps
  class PaletteItemsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: %i[index suggestions]
    before_action :set_item, only: %i[update destroy]
    before_action :set_draft, only: %i[accept reject]

    def index
      render json: { items: @map.palette_items.includes(species: :common_names, variety: %i[common_names species]).map(&:as_json) }
    end

    def suggestions
      render json: PaletteSuggestions.new(@map)
    end

    # Adding a species an AI already proposed accepts its draft.
    def create
      draft = @map.palette_drafts.find_by(item_params.slice(:species_id, :variety_id).to_h.reverse_merge("variety_id" => nil))
      item = draft || @map.palette_items.new(item_params.merge(created_by: Current.user))
      if draft ? draft.update(status: "active") : item.save
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

    def accept
      @drafts.each { |draft| draft.update!(status: "active") }
      render json: { planting: PlantingState.new(@map) }
    end

    def reject
      @drafts.each(&:destroy!)
      render json: { planting: PlantingState.new(@map) }
    end

    private
      def set_item
        @item = @map.palette_items.find(params[:id])
      end

      # One draft by id, or every pending draft with id « all ».
      def set_draft
        @drafts = params[:id] == "all" ? @map.palette_drafts.to_a : [ @map.palette_drafts.find(params[:id]) ]
      end

      def item_params
        params.require(:palette_item).permit(:species_id, :variety_id, :strata, :role, :notes, :target_count)
      end
  end
end
