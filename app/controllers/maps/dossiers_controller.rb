# The « Dossier du projet » of a map: a printable A4 document (the browser
# prints it to PDF) gathering the project sheet, the terrain, the climate,
# the soil, the design, the plant list, the alerts, photos, finances and
# sources. Every role on the map can open it (viewers read only).
#
#   GET /maps/:map_id/dossier        the page (Inertia), which loads…
#   GET /maps/:map_id/dossier.json   …everything it shows (MapDossier).
#
# `networks=1` adds the sensitive networks, for owners and editors only.
module Maps
  class DossiersController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      respond_to do |format|
        format.html do
          render inertia: "maps/dossiers/show", props: {
            map: { id: @map.id, name: @map.name, role: @role },
            canEdit: %w[owner editor].include?(@role)
          }
        end
        format.json do
          dossier = MapDossier.new(@map, user: Current.user, include_networks: params[:networks] == "1")
          render json: dossier.as_json
        end
      end
    end
  end
end
