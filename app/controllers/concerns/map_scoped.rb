# Loads @map from params[:map_id] (or params[:id]) and enforces the role.
module MapScoped
  extend ActiveSupport::Concern

  private
    def set_map
      @map = Map.find(params[:map_id] || params[:id])
      @role = @map.role_for(Current.user)
      head :not_found unless @role
    end

    def require_editor!
      if %w[owner editor].include?(@role)
        return unless @map.read_only_by_plan?
        return deny_editing_by_plan
      end
      respond_to do |format|
        format.json { render json: { message: t("maps.errors.read_only") }, status: :forbidden }
        format.any { redirect_to map_path(@map), alert: t("maps.errors.read_only") }
      end
    end

    # The owner's plan ran out and this map is over the free limit: readable,
    # not editable. Tells the user how to get editing back.
    def deny_editing_by_plan
      respond_to do |format|
        format.json { render json: { message: t("billing.read_only_by_plan"), code: "read_only_by_plan", upsellUrl: billing_path }, status: :forbidden }
        format.any { redirect_to map_path(@map), alert: t("billing.read_only_by_plan") }
      end
    end

    def require_owner!
      return if @role == "owner"
      respond_to do |format|
        format.json { render json: { message: t("maps.errors.owner_only") }, status: :forbidden }
        format.any { redirect_to map_path(@map), alert: t("maps.errors.owner_only") }
      end
    end

    def map_entitlements
      @map_entitlements ||= Entitlements.for_map(@map)
    end
end
