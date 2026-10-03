# The plant list of a map: JSON for the panel, CSV to order, and a page
# made for printing.
module Maps
  class PlantListsController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      list = @map.plant_list
      respond_to do |format|
        format.json { render json: list }
        format.csv do
          send_data list.to_csv, type: "text/csv; charset=utf-8",
                                 filename: "#{t('plant_list.csv_filename')}-#{@map.name.parameterize}.csv"
        end
      end
    end

    def print
      quantities = @map.planted_quantities
      render inertia: "maps/plant_lists/print", props: {
        map: { id: @map.id, name: @map.name, areaM2: @map.area_m2, ownerName: @map.owner.display_name },
        list: PlantList.new(quantities).as_json,
        alerts: PlantingAlerts.new(quantities).as_json,
        generatedOn: Date.current.iso8601
      }
    end
  end
end
