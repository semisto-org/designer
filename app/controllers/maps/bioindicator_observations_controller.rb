# Bio-indicator plants seen on the terrain, and what they say about the soil.
# Free for everyone: the list and its meaning are reference, not an analysis.
module Maps
  class BioindicatorObservationsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: %i[index species]
    before_action :set_observation, only: %i[update destroy]

    def index
      observations = @map.bioindicator_observations.recent.includes(:observed_by).to_a
      render json: {
        observations: observations.map(&:as_inertia),
        summary: SoilAnalysis::BioindicatorCatalog.tally(observations),
        catalog: SoilAnalysis::BioindicatorCatalog.all,
        plantCatalog: SoilAnalysis::SpeciesLookup.available?
      }
    end

    # Suggestions for the species field: the curated list first, then the plant
    # catalogue when there is one.
    def species
      query = params[:q].to_s
      render json: {
        catalog: SoilAnalysis::BioindicatorCatalog.search(query, limit: 8),
        plants: SoilAnalysis::SpeciesLookup.search(query, limit: 8)
      }
    end

    def create
      observation = @map.bioindicator_observations.new(observation_params.merge(observed_by: Current.user, observed_on: observation_params[:observed_on].presence || Date.current))
      observation.save ? render(json: observation.as_inertia, status: :created) : render_errors(observation)
    end

    def update
      @observation.update(observation_params) ? render(json: @observation.as_inertia) : render_errors(@observation)
    end

    def destroy
      @observation.destroy!
      head :no_content
    end

    private
      def set_observation
        @observation = @map.bioindicator_observations.find(params[:id])
      end

      def observation_params
        raw = params.require(:bioindicator_observation).permit(:species_name, :latin_name, :catalog_key, :plant_species_id, :abundance, :observed_on, :notes, :lng, :lat)
        raw[:location] = MapPhoto.point_from(raw[:lng], raw[:lat]) if raw.key?(:lng) || raw.key?(:lat)
        raw.except(:lng, :lat)
      end
  end
end
