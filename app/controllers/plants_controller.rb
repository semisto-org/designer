# The plant catalogue: search (/plants) and species sheets (/plants/:id).
# Read-only in v1. Both answer JSON too, for the map editor's palette.
class PlantsController < ApplicationController
  def index
    search = PlantSearch.new(params, country: country, user: Current.user)
    return render json: search.as_json if json_request?

    render inertia: "plants/index", props: {
      search: search.as_json,
      vocabulary: vocabulary,
      region: region_json,
      catalogueSize: PlantSpecies.reviewed.count,
      # The species waiting for a catalogue reviewer, for the ones who review.
      toReview: Current.user&.can_review_catalogue? ? PlantSpecies.proposed.count : nil
    }
  end

  def show
    species = PlantSpecies.visible_to(Current.user).with_photos
                          .includes(:genus, :common_names, :field_sources, varieties: %i[common_names field_sources])
                          .find(params[:id].to_i)
    sheet = species.sheet_json
    return render json: { species: sheet } if json_request?

    render inertia: "plants/show", props: {
      species: sheet,
      observations: PlantObservation.stats_for(species),
      # Where it grows on the maps this person can open (never another's).
      plantings: SpeciesPlantings.new(species, Current.user).as_json,
      region: region_json
    }
  end

  private
    def json_request? = request.format.json? && !request.inertia?

    def region = @region ||= Region.default

    # Country for the « native » / « not invasive » filters: the one asked
    # (the map's, from the editor), else the default region's.
    def country
      asked = params[:country].to_s.upcase
      asked.match?(/\A[A-Z]{2}\z/) ? asked : region&.country_code
    end

    def region_json
      return nil unless region
      zone = region.setting(:climate, :hardiness_zone)
      { name: region.name, country: region.country_code, zone: zone.presence&.to_i }
    end

    def vocabulary
      {
        strata: PlantVocabulary::STRATA,
        plantType: PlantVocabulary.keys(:plant_type),
        exposures: PlantVocabulary.keys(:exposures),
        soilMoisture: PlantVocabulary.keys(:soil_moisture)
      }
    end
end
