# The views editors save for a map's « Palette végétale » (PlantPaletteView).
# Writes answer with the map's whole list of views.
module Maps
  class PlantPaletteViewsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!
    before_action :set_view, only: %i[update destroy]

    def create
      view = @map.plant_palette_views.new(view_params.merge(created_by: Current.user))
      if view.save
        render json: { view:, views: views }, status: :created
      else
        render_errors view
      end
    end

    def update
      if @view.update(view_params)
        render json: { view: @view, views: views }
      else
        render_errors @view
      end
    end

    def destroy
      @view.destroy!
      render json: { views: views }
    end

    # The shape PlantPaletteView.clean_settings reads; it still checks every value.
    SETTINGS_KEYS = [
      :group_by, { columns: [], sort: %i[key dir],
                   filters: [ :tag, :untagged, :supplier, :search, :to_plant_only, { statuses: [], strata: [], roles: [] } ] }
    ].freeze

    private
      def set_view
        @view = @map.plant_palette_views.find(params[:id])
      end

      def views = @map.plant_palette_views.reload.map(&:as_json)

      def view_params
        attrs = params.require(:view).permit(:name, :position)
        settings = params[:view][:settings]
        attrs[:settings] = settings.permit(*SETTINGS_KEYS).to_h if settings.respond_to?(:permit)
        attrs
      end
  end
end
