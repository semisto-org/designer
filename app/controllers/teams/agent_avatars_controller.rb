module Teams
  # /teams/:team_id/collegue/avatar — the picture a team admin gives the
  # team's AI colleague (TeamAgent#avatar). Removing it brings back the
  # sparkle on its leaf disc.
  class AgentAvatarsController < ApplicationController
    include TeamScoped

    forbid_while_impersonating
    before_action :set_team
    before_action :require_team_admin!
    before_action :set_agent

    def update
      file = params.dig(:agent, :avatar)
      unless file.is_a?(ActionDispatch::Http::UploadedFile)
        return redirect_to team_agent_path(@team), inertia: { errors: { avatar: t("account.avatar.errors.missing") } }, status: :see_other
      end

      @agent.avatar = file
      if @agent.save
        redirect_to team_agent_path(@team), notice: t("agents.avatar.saved", name: @agent.name), status: :see_other
      else
        redirect_to team_agent_path(@team), inertia: { errors: { avatar: @agent.errors[:avatar].first || @agent.errors.full_messages.first } }, status: :see_other
      end
    end

    def destroy
      @agent.avatar.purge
      redirect_to team_agent_path(@team), notice: t("agents.avatar.removed", name: @agent.name), status: :see_other
    end

    private
      # She gets a picture once she has a name.
      def set_agent
        @agent = (@team.team_agent if @team.agents_module?)
        head :not_found unless @agent
      end
  end
end
