# Loads @territory for the members of its team only (404 for everyone else,
# so a territory's existence does not leak) and checks it can be changed:
# the module granted to the team and the territory not archived.
module TerritoryScoped
  extend ActiveSupport::Concern

  private
    def set_territory
      @territory = Territory.visible_to(Current.user).includes(:organization, :region).find_by(id: params[:territory_id] || params[:id])
      head :not_found unless @territory
    end

    def require_territory_editor!
      return if @territory.editable_by?(Current.user)
      key = @territory.archived? ? "territories.errors.archived" : "territories.errors.module_off"
      respond_to do |format|
        format.json { render json: { message: t(key) }, status: :forbidden }
        format.any { redirect_to territory_path(@territory), alert: t(key), status: :see_other }
      end
    end
end
