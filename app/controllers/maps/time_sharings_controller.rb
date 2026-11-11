# « Montrer au client »: the one switch that opens a project's progress (per
# phase, in %) and its expenses to the map's viewers, often the client.
# Never names, rates, hours or margin. The team turns it on or off.
module Maps
  class TimeSharingsController < ApplicationController
    include MapScoped

    before_action :set_map

    def update
      return render(json: { message: t("time_entries.errors.no_access") }, status: :forbidden) unless TimeEntry.usable_by?(@map, Current.user)
      @map.update!(time_shared_with_client: ActiveModel::Type::Boolean.new.cast(params[:shared]) || false)
      render json: { shared: @map.time_shared_with_client }
    end
  end
end
