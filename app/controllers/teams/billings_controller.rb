module Teams
  # « Forfait de l'équipe »: an admin takes the team's maps on their own plan
  # (update), or the team goes back to « each map follows its owner's plan »
  # (destroy). Taking it over is only ever done for oneself, never for another
  # admin: nobody is made to pay without saying so.
  class BillingsController < ApplicationController
    include TeamScoped

    forbid_while_impersonating
    before_action :set_team
    before_action :require_team_admin!

    def update
      @team.update!(billing_user: Current.user)
      redirect_to team_path(@team), notice: t("team_billing.taken", team: @team.name), status: :see_other
    end

    def destroy
      @team.update!(billing_user: nil)
      redirect_to team_path(@team), notice: t("team_billing.released"), status: :see_other
    end
  end
end
