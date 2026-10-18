# POST /maps/:map_id/archive — the owner puts a finished (or paused) map
# away: it leaves « Mes cartes », stays readable and stops counting against
# the plan's active maps. DELETE brings it back, if the plan has room.
module Maps
  class ArchivesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_owner!

    def create
      @map.archive!
      redirect_to maps_path, notice: t("maps.archives.archived", name: @map.name), status: :see_other
    end

    def destroy
      return redirect_back_or_to(maps_path, alert: t("maps.archives.no_room"), status: :see_other) unless @map.unarchivable?
      @map.unarchive!
      redirect_to map_path(@map), notice: t("maps.archives.restored", name: @map.name), status: :see_other
    end
  end
end
