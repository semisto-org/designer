# The relief and water analyses are a paid extra: they follow the map
# owner's plan (`Entitlements.for_map`), like every analysis.
module ReliefGate
  extend ActiveSupport::Concern

  private
    def require_analyses!
      return if map_entitlements.analyses?

      respond_to do |format|
        format.json { render json: { message: t("relief.upsell.body"), upsell: true }, status: :payment_required }
        format.any { redirect_to map_path(@map), alert: t("relief.upsell.body") }
      end
    end
end
