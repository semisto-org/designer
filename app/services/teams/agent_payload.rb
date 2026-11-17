module Teams
  # What the « Collègue IA » page shows: who she is, the maps where she
  # works, this month's spending against the ceiling and the journal of her
  # latest requests (who asked, where, which tools, what it cost; never what
  # was said). Only admins get the settings (the key is never sent back,
  # only its hint).
  class AgentPayload
    RUNS = 30

    def initialize(team, user)
      @team = team
      @admin = team.admin?(user)
    end

    def as_json(*)
      agent = @team.team_agent
      {
        team: { id: @team.id, name: @team.name, admin: @admin },
        agent: agent&.as_json,
        ready: @team.colleague.present?,
        hasKey: @team.agent_api_key.present?,
        maps: maps,
        usage: {
          spentCents: (@team.agent_spent_micros / 10_000.0).round,
          budgetCents: @team.agent_monthly_budget_cents,
          requests: @team.agent_runs.in_month.count
        },
        runs: @team.agent_runs.newest_first.limit(RUNS).includes(:map, :requested_by).map(&:as_json),
        settings: (settings if @admin),
        limits: { name: TeamAgent::NAME_MAX_LENGTH, instructions: TeamAgent::INSTRUCTIONS_MAX_LENGTH, budgetMaxCents: Organization::AGENT_BUDGET_MAX_CENTS }
      }
    end

    private
      def maps
        @team.maps.active.order(:name).map do |map|
          { id: map.id, name: map.name, address: map.address, enabled: map.agent_enabled? }
        end
      end

      def settings
        { keyHint: @team.agent_api_key_hint, provider: @team.agent_provider, model: Agents::Pricing::MODEL }
      end
  end
end
