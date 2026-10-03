# The plant catalogue: search (/plants) and species sheets (/plants/:id).
# Read-only in v1. Both answer JSON too, for the map editor's palette.
class PlantsController < ApplicationController
  def index
    search = PlantSearch.new(params, country: country)
    return render json: search.as_json if json_request?

    render inertia: "plants/index", props: {
      search: search.as_json,
      vocabulary: vocabulary,
      region: region_json,
      catalogueSize: PlantSpecies.count
    }
  end

  def show
    species = PlantSpecies.includes(:genus, :common_names, :field_sources, varieties: %i[common_names field_sources])
                          .find(params[:id].to_i)
    sheet = species.sheet_json
    return render json: { species: sheet } if json_request?

    render inertia: "plants/show", props: {
      species: sheet,
      observations: PlantObservation.stats_for(species),
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
