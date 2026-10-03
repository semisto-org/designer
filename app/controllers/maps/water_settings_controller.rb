# The water parameters of a map (rainfall, roof coefficient, soil type…),
# over its region's defaults. Editors change them from the editor panel.
module Maps
  class WaterSettingsController < ApplicationController
    include MapScoped
    include ReliefGate

    before_action :set_map
    before_action :require_analyses!
    before_action :require_editor!

    def update
      @map.water_settings = params.require(:water_settings).permit(*HasTerrain::WATER_KEYS)
      if @map.save
        render json: Relief::Overview.new(@map).as_json
      else
        render_errors @map
      end
    end
  end
end
