module Teams
  # « Collègue IA »: the page of a team's AI colleague (TeamAgent). Every
  # member reads who she is, where she works and what she did; admins name
  # her, write the team's own instructions, give the team's API key and set
  # the monthly ceiling. The module itself is granted by Semisto
  # (Admin::TeamsController): without it the page does not exist.
  class AgentsController < ApplicationController
    include TeamScoped

    forbid_while_impersonating only: :update
    before_action :set_team
    before_action :require_agents_module!
    before_action :require_team_admin!, only: :update

    def show
      render inertia: "teams/agent", props: Teams::AgentPayload.new(@team, Current.user).as_json
    end

    def update
      Organization.transaction do
        agent = @team.team_agent || @team.build_team_agent(created_by: Current.user)
        agent.assign_attributes(agent_params) if params.key?(:agent)
        agent.save! if agent.new_record? ? params.key?(:agent) : agent.changed?
        @team.update!(settings_params) if params.key?(:settings)
      end
      redirect_to team_agent_path(@team), notice: t("agents.flash.saved"), status: :see_other
    rescue ActiveRecord::RecordInvalid => e
      redirect_to team_agent_path(@team), inertia: { errors: e.record.errors }, status: :see_other
    end

    private
      def require_agents_module!
        head :not_found unless @team.agents_module?
      end

      def agent_params
        params.require(:agent).permit(:name, :instructions, :active)
      end

      # An empty key field keeps the key; `remove_api_key` takes it away.
      def settings_params
        given = params.require(:settings).permit(:api_key, :remove_api_key, :monthly_budget)
        attributes = {}
        attributes[:agent_api_key] = given[:api_key].strip if given[:api_key].present?
        attributes[:agent_api_key] = nil if ActiveModel::Type::Boolean.new.cast(given[:remove_api_key])
        attributes[:agent_monthly_budget_cents] = (given[:monthly_budget].to_s.tr(",", ".").to_f * 100).round if given.key?(:monthly_budget)
        attributes
      end
  end
end
