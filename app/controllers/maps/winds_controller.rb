# JSON for the wind of a map's place: the wind roses of the « Secteurs » and
# « Climat » panels, the project dossier and the 3D compass (#show), and the
# shelter of one tree from each of its winds, for its sheet in the editor
# (#shelter). The first request starts the computation of the observed
# climate when nobody asked for it yet (minutes); the panel polls.
module Maps
  class WindsController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: Wind::MapReport.new(@map).as_json
    end

    def shelter
      feature = @map.features.find(params.require(:feature_id))
      render json: { shelter: Wind::Shelter.new(@map).for(feature)&.then { camelize(_1) } }
    end

    private
      def camelize(value)
        case value
        when Hash then value.to_h { |key, item| [ key.to_s.camelize(:lower), camelize(item) ] }
        when Array then value.map { camelize(_1) }
        else value
        end
      end
  end
end
