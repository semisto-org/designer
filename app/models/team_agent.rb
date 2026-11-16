# « Collègue IA »: the AI member of a team. She has a first name, a job
# description (Semisto's base sheet, `app/agents/colleague.md`, completed by
# the team's own `instructions`) and works only when a member of the team
# asks: a mention in a discussion or a task given to her (AgentRun), on the
# maps where a team admin switched her on (`maps.agent_enabled_at`).
#
# She is not a User: she never signs in, owns nothing and holds no role. What
# she does, she does on behalf of the member who asked, with that member's
# rights at most (Agents::Runner), and it is always shown as hers.
class TeamAgent < ApplicationRecord
  NAME_MAX_LENGTH = 30
  INSTRUCTIONS_MAX_LENGTH = 4_000

  belongs_to :organization
  belongs_to :created_by, class_name: "User", optional: true
  has_many :runs, class_name: "AgentRun", dependent: :destroy

  normalizes :name, with: ->(name) { name.to_s.squish }
  normalizes :instructions, with: ->(text) { text.to_s.strip.presence }

  # A first name one can type after « @ ».
  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH },
    format: { with: /\A[[:alpha:]][[:alpha:]' -]*\z/, message: :invalid_name }
  validates :instructions, length: { maximum: INSTRUCTIONS_MAX_LENGTH }
  validate :name_of_no_member, if: :will_save_change_to_name?

  scope :active, -> { where(active: true) }

  # What follows « @ » in a message.
  def handle = name

  def mentioned_in?(body)
    body.to_s.match?(/(?<![[:alnum:]_@])@#{Regexp.escape(handle)}(?![[:alnum:]_])/i)
  end

  def as_json(*)
    { id:, name:, instructions:, active: }
  end

  private
    # « @Marie » must not hesitate between a person and the colleague.
    def name_of_no_member
      return unless organization
      taken = organization.users.any? { |user| user.display_name.to_s.strip.casecmp?(name) }
      errors.add(:name, :taken_by_member) if taken
    end
end
