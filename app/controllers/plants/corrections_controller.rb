# « Suggérer une correction » on a species sheet: the suggestion waits for a
# catalogue reviewer (PlantCorrection); the catalogue does not change before.
class Plants::CorrectionsController < ApplicationController
  def create
    species = PlantSpecies.visible_to(Current.user).find(params[:plant_id].to_i)
    correction = species.corrections.new(correction_params.merge(user: Current.user, origin: "web"))
    if correction.save
      redirect_to plant_path(species), notice: t("plants.corrections.flash.sent"), status: :see_other
    else
      redirect_to plant_path(species), alert: t("plants.corrections.flash.invalid"), status: :see_other
    end
  end

  private
    def correction_params
      params.require(:correction).permit(:field, :proposed_value, :note, :source_url)
    end
end
