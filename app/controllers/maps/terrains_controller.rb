# The relief of a map, for the editor's "Eau et relief" panel: import state
# and key numbers (GET), launch or relaunch the import (POST).
module Maps
  class TerrainsController < ApplicationController
    include MapScoped
    include ReliefGate

    before_action :set_map
    before_action :require_analyses!
    before_action :require_editor!, only: :create

    def show
      render json: Relief::Overview.new(@map).as_json
    end

    def create
      terrain = @map.terrain || @map.build_terrain
      return render_message(:already_running, :conflict) if terrain.persisted? && terrain.in_progress?
      return render_message(:unavailable, :unprocessable_entity) unless Providers::Elevation.available?(@map.region)
      return render_message(:no_boundary, :unprocessable_entity) unless @map.boundary

      begin
        Relief::GridPolicy.extent_for(@map.bbox, margin_m: @map.region.setting(:relief, :margin_m) || Relief::GridPolicy::DEFAULT_MARGIN_M)
      rescue Relief::GridPolicy::TooLarge => e
        return render json: { message: e.message }, status: :unprocessable_entity
      end

      terrain.update!(status: "pending", progress: 0, error: nil)
      ReliefImportJob.perform_later(terrain)
      render json: Relief::Overview.new(@map.reload).as_json, status: :accepted
    end

    private
      def render_message(key, status)
        render json: { message: t("relief.errors.#{key}") }, status:
      end
  end
end
