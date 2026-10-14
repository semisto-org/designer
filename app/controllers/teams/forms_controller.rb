# The team's own forms (« Formulaires », /teams/:id/forms): where Tally
# sends the answers, the forms the team sends from its maps, and the answers
# received, with those still to file. Every member reads and files answers;
# admins connect Tally, add and remove forms.
module Teams
  class FormsController < ApplicationController
    include TeamScoped

    before_action :set_team
    before_action :require_team_admin!, except: :index

    def index
      render inertia: "teams/forms", props: Teams::FormsPayload.new(@team, Current.user).as_json
    end

    def connect
      FormInbox.for(@team)
      redirect_to team_forms_path(@team), notice: t("forms.flash.connected"), status: :see_other
    end

    # A new address and secret, when the old ones leaked.
    def reset
      @team.form_inbox&.reset!
      redirect_to team_forms_path(@team), notice: t("forms.flash.reset"), status: :see_other
    end

    def create
      inbox = FormInbox.for(@team)
      external_id = ExternalForm.tally_id(form_params[:link])
      return redirect_with_error(:link, t("forms.errors.link")) unless external_id

      form = inbox.forms.find_or_initialize_by(provider: "tally", external_id:)
      form.name = form_params[:name].presence || form.name.presence || t("forms.default_name", id: external_id)
      if form.save
        redirect_to team_forms_path(@team), notice: t("forms.flash.added", name: form.name), status: :see_other
      else
        redirect_with_error(:name, form.errors.full_messages.to_sentence)
      end
    end

    # The answers already filed stay in the maps' documents.
    def destroy
      form = @team.form_inbox&.forms&.find_by(id: params[:id])
      return head :not_found unless form
      form.destroy!
      redirect_to team_forms_path(@team), notice: t("forms.flash.removed", name: form.name), status: :see_other
    end

    private
      def form_params = params.fetch(:form, {}).permit(:link, :name)

      def redirect_with_error(field, message)
        redirect_to team_forms_path(@team), inertia: { errors: { field => message } }, status: :see_other
      end
  end
end
