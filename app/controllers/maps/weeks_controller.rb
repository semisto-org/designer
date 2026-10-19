# JSON for « Cette semaine chez toi » on the phone's map screen: the week's
# forecast and frost alert, the season, what the plants do this month and
# the tasks due (WeekReport). Read by anyone who can see the map.
module Maps
  class WeeksController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: WeekReport.new(@map).as_json
    end
  end
end
