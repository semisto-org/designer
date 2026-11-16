# One request made to a team's colleague (TeamAgent): a message that mentions
# her or a task given to her, by one member, on one map. It is the journal
# of what she did (turns, tools, tokens, cost), never of what was said: the
# exchange with the model is not kept.
class AgentRun < ApplicationRecord
  # queued, running, then: done; `limit` (the per-request work limit was
  # reached, she said where she stopped); `budget` (the team's monthly
  # ceiling); `failed` (the key was refused, the provider was down…).
  STATUSES = %w[queued running done limit budget failed].freeze
  OPEN = %w[queued running].freeze

  belongs_to :team_agent
  belongs_to :organization
  belongs_to :map
  belongs_to :requested_by, class_name: "User"
  belongs_to :source, polymorphic: true
  belongs_to :reply_comment, class_name: "Comment", optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :source_type, inclusion: { in: %w[Comment Task] }

  scope :open, -> { where(status: OPEN) }
  scope :newest_first, -> { order(created_at: :desc, id: :desc) }
  scope :in_month, ->(time = Time.current) { where(created_at: time.all_month) }

  def open? = OPEN.include?(status)
  def task? = source_type == "Task"

  def cost_cents = (cost_micros / 10_000.0).round(2)

  def as_json(*)
    {
      id:, status:, kind: task? ? "task" : "mention",
      mapId: map_id, mapName: map.name, requestedBy: requested_by.display_name,
      toolCalls: tool_calls, tools: tools_used, costCents: cost_cents,
      createdAt: created_at.iso8601, finishedAt: finished_at&.iso8601
    }
  end
end
