# An answer to one of the team's forms: any member files it in one of the
# team's maps (or moves it); admins delete it.
module Teams
  class FormResponsesController < ApplicationController
    include TeamScoped

    before_action :set_team
    before_action :require_team_admin!, only: :destroy
    before_action :set_response

    def update
      map = @inbox.maps.find_by(id: params.dig(:response, :map_id))
      return redirect_to(team_forms_path(@team), alert: t("forms.errors.map"), status: :see_other) unless map
      @response.file_in!(map)
      redirect_to team_forms_path(@team), notice: t("forms.flash.filed", map: map.name), status: :see_other
    end

    # Its document, if it was filed, stays in the map.
    def destroy
      @response.destroy!
      redirect_to team_forms_path(@team), notice: t("forms.flash.deleted"), status: :see_other
    end

    private
      def set_response
        @inbox = @team.form_inbox
        @response = @inbox && FormResponse.joins(:form).where(external_forms: { form_inbox_id: @inbox.id }).find_by(id: params[:id])
        head :not_found unless @response
      end
  end
end
