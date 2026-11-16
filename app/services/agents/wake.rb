module Agents
  # Wakes a team's colleague for one request: a message that mentions her
  # (once per message, whatever is retried) or a task given to her (never
  # twice at the same time). Nothing else wakes her: no schedule, no message
  # of her own.
  module Wake
    def self.for_comment(comment)
      agent = TeamAgent.find_by(id: comment.mentioned_agent_ids.first)
      return unless agent && !comment.by_agent?
      start(agent, map: comment.map, by: comment.author, source: comment)
    rescue ActiveRecord::RecordNotUnique
      nil
    end

    def self.for_task(task, by:)
      agent = task.agent
      return unless agent && task.map.colleague_for(by) == agent
      return if AgentRun.open.where(source: task).exists?
      start(agent, map: task.map, by:, source: task)
    end

    def self.start(agent, map:, by:, source:)
      run = AgentRun.create!(team_agent: agent, organization: agent.organization, map:, requested_by: by, source:)
      AgentRunJob.perform_later(run)
      run
    end
    private_class_method :start
  end
end
