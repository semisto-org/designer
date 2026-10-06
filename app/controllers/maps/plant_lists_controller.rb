# The plant list of a map: JSON for the panel, CSV to order, and a page
# made for printing.
module Maps
  class PlantListsController < ApplicationController
    include MapScoped

    before_action :set_map

    # `tag`: only the plants and patches carrying it (`untagged=1`: those
    # without any tag). `group=tag` (JSON): one list per tag, then the untagged.
    def show
      return render(json: grouped_by_tag) if params[:group] == "tag" && request.format.json?

      list = @map.plant_list(tag: tag_filter)
      respond_to do |format|
        format.json { render json: list }
        format.csv do
          send_data list.to_csv, type: "text/csv; charset=utf-8", filename: csv_filename
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

    private
      def tag_filter
        return :untagged if params[:untagged] == "1"
        params[:tag].presence
      end

      def csv_filename
        tag = tag_filter.is_a?(String) ? "-#{tag_filter.parameterize}" : ""
        "#{t('plant_list.csv_filename')}-#{@map.name.parameterize}#{tag}.csv"
      end

      # A plant carrying two tags appears under both: each group is the list
      # of that tag, as if filtered by it.
      def grouped_by_tag
        tags = @map.features.active.where(layer: "plants").tag_counts.keys
        groups = tags.map { |tag| { tag:, list: @map.plant_list(tag:).as_json } }
        { groups: groups.select { |group| group[:list][:total].positive? }, untagged: @map.plant_list(tag: :untagged).as_json }
      end
  end
end
