# One request to a team's colleague (Agents::Runner), on its own queue: a
# run can take minutes and must never hold up e-mails or conversions. One at
# a time per team: two answers never work on the same drafts together, the
# monthly ceiling is checked against settled figures, and a busy team takes
# one thread at most.
class AgentRunJob < ApplicationJob
  queue_as :agents
  discard_on ActiveJob::DeserializationError
  limits_concurrency to: 1, key: ->(run) { "agent-team-#{run.organization_id}" }, duration: 20.minutes if respond_to?(:limits_concurrency)

  def perform(run)
    I18n.with_locale(:fr) { Agents::Runner.new(run).call }
  end
end
