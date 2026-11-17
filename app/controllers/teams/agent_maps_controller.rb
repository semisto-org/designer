module Teams
  # Switches the team's colleague on or off for one map of the team. Off by
  # default: an admin decides map by map (a client may not want an AI), and
  # everyone on the map sees it in its discussion.
  class AgentMapsController < ApplicationController
    include TeamScoped

    forbid_while_impersonating
    before_action :set_team
    before_action :require_team_admin!

    def update
      return head :not_found unless @team.agents_module?
      map = @team.maps.find(params[:id])
      if ActiveModel::Type::Boolean.new.cast(params[:enabled])
        map.update!(agent_enabled_at: Time.current, agent_enabled_by: Current.user) unless map.agent_enabled?
      else
        map.update!(agent_enabled_at: nil, agent_enabled_by: nil)
      end
      redirect_to team_agent_path(@team), status: :see_other
    end
  end
end
