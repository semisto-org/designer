# A species the catalogue lacks, added from the map's palette: its name is
# checked against GBIF first (check), then it enters the catalogue as
# « proposed », for its author and this map until a reviewer accepts it
# (Catalog::SpeciesProposal, CatalogueReviewsController).
module Maps
  class PlantProposalsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!

    def check
      render json: proposal.check(params[:name].to_s.first(120))
    end

    def create
      result = proposal.create(
        latin_name: proposal_params[:latin_name], common_name: proposal_params[:common_name],
        values: proposal_params.slice(:strata, :height_max_m, :spread_max_m).to_h
      )
      render json: { species: result.species.summary_json, created: result.created, planting: PlantingState.new(@map) },
             status: result.created ? :created : :ok
    rescue Catalog::SpeciesProposal::Refused => error
      render json: { message: error.message }, status: :unprocessable_entity
    end

    private
      def proposal = @proposal ||= Catalog::SpeciesProposal.new(map: @map, user: Current.user)

      def proposal_params
        params.require(:plant_proposal).permit(:latin_name, :common_name, :strata, :height_max_m, :spread_max_m)
      end
  end
end
