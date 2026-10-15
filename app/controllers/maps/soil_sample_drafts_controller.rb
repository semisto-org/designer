# The values the person's AI read in a soil sample's lab reports (MCP
# propose_soil_results): an editor keeps or refuses them, one by one or all
# together. Only kept values reach the sample.
module Maps
  class SoilSampleDraftsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!
    before_action :set_sample

    # { keep: ["result:ph_water", "other:Plomb (Pb)", "lab"…], refuse: [...] }
    def update
      draft = @sample.draft
      draft.keep!(Array(params[:keep])) if params[:keep].present?
      @sample.draft.refuse!(Array(params[:refuse])) if params[:refuse].present?
      render json: @sample.reload.as_inertia(analyses: map_entitlements.analyses?)
    rescue ActiveRecord::RecordInvalid
      render_errors @sample
    end

    # Refuses everything left.
    def destroy
      @sample.draft.refuse!
      render json: @sample.reload.as_inertia(analyses: map_entitlements.analyses?)
    end

    private
      def set_sample
        @sample = @map.soil_samples.find(params[:soil_sample_id])
      end
  end
end
