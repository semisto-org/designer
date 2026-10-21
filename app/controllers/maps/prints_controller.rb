# POST /maps/:map_id/print — the plan went to paper (the PDF at scale, or the
# dossier's « Imprimer »). Only the first time is kept, for « Premières
# heures »; anyone who can open the map may print it.
module Maps
  class PrintsController < ApplicationController
    include MapScoped

    before_action :set_map

    def create
      @map.update_column(:plan_printed_at, Time.current) unless @map.plan_printed_at || impersonating?
      head :no_content
    end
  end
end
