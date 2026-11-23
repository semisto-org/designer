# The corrections people suggested for species of the catalogue, accepted or
# rejected by a catalogue reviewer from /plants/review.
class PlantCorrectionsController < ApplicationController
  before_action { head :not_found unless Current.user&.can_review_catalogue? }
  before_action { @correction = PlantCorrection.pending.find(params[:id]) }

  def accept
    @correction.accept!(Current.user)
    redirect_to catalogue_reviews_path(anchor: "corrections"), notice: t("plants.corrections.flash.accepted", name: @correction.species.latin_name), status: :see_other
  rescue ActiveRecord::RecordInvalid
    redirect_to catalogue_reviews_path(anchor: "corrections"), alert: t("plants.corrections.flash.not_applied"), status: :see_other
  end

  def reject
    @correction.reject!(Current.user)
    redirect_to catalogue_reviews_path(anchor: "corrections"), notice: t("plants.corrections.flash.rejected", name: @correction.species.latin_name), status: :see_other
  end
end
