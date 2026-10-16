# JSON for « Le bilan de l'eau, mois par mois » in the "Climat" panel: the
# observed climate turned into rain, evaporation, soil reserve, surplus and
# deficit, today and in 2050, with what the map holds to face it.
module Maps
  class WaterBalancesController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: WaterBalance::MapReport.new(@map).as_json
    end
  end
end
