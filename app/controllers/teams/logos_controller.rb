module Teams
  # /teams/:id/logo — the team's logo, printed at the top of the documents of
  # every team map (Map#letterhead). Admins choose it.
  class LogosController < ApplicationController
    include TeamScoped

    before_action :set_team
    before_action :require_team_admin!

    def update
      file = params.dig(:team, :logo)
      unless file.is_a?(ActionDispatch::Http::UploadedFile)
        return redirect_to team_path(@team), inertia: { errors: { logo: t("logos.errors.missing") } }, status: :see_other
      end

      @team.logo = file
      if @team.save
        redirect_to team_path(@team), notice: t("logos.saved"), status: :see_other
      else
        redirect_to team_path(@team), inertia: { errors: { logo: @team.errors[:logo].first || @team.errors.full_messages.first } }, status: :see_other
      end
    end

    def destroy
      @team.logo.purge
      redirect_to team_path(@team), notice: t("logos.removed"), status: :see_other
    end
  end
end
