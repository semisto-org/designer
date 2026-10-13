# Where a team map stands in the life of a project, for the team board
# (« Tableau de l'équipe »): one timeline from the first request to
# completion, who leads it, who of the team works on it, and the date
# promised to the client. This is the team's follow-up; the design journey
# (`stage`: observe, map, design, plant) stays what the editor shows.
#
# Two flags sit beside the phase without replacing it: « En veille » (on
# hold, the project keeps its phase) and « Sans suite » (closed: a declined
# offer, no reply). A map without a phase reads as « design ».
#
# The project's next step is not stored here: it is the map's first pending
# task with a date (Task), so it has a person, a date and an e-mail.
module MapBoard
  extend ActiveSupport::Concern

  PHASES = %w[request offer design implementation co_management completed].freeze
  CLOSED_REASONS = %w[declined no_reply other].freeze
  NOTE_MAX_LENGTH = 300
  PROMISED_WHAT_MAX_LENGTH = 80

  included do
    belongs_to :lead, class_name: "User", optional: true
    has_many :assignments, class_name: "MapAssignment", dependent: :delete_all
    has_many :crew, through: :assignments, source: :user

    validates :phase, inclusion: { in: PHASES }, allow_nil: true
    validates :closed_reason, inclusion: { in: CLOSED_REASONS }, allow_nil: true
    validates :closed_note, length: { maximum: NOTE_MAX_LENGTH }
    validates :promised_what, length: { maximum: PROMISED_WHAT_MAX_LENGTH }
    validate :lead_takes_part, if: -> { lead_id && will_save_change_to_lead_id? }

    normalizes :closed_note, :promised_what, with: ->(text) { text.to_s.squish.presence }

    before_save -> { self.phase_changed_at = Time.current }, if: :will_save_change_to_phase?
    # Moving to another phase wakes a project, unless the same change puts it on hold.
    before_save -> { self.on_hold_since = nil }, if: -> { (will_save_change_to_phase? && !will_save_change_to_on_hold_since?) || (will_save_change_to_closed_at? && closed_at) }
  end

  def board_phase = phase.presence || "design"
  def on_hold? = on_hold_since.present?
  def closed? = closed_at.present?

  # The pending dated task that comes first: what the board shows as the
  # project's next step.
  def next_step_task
    tasks.pending.where.not(due_on: nil).order(:due_on, :position, :id).first
  end

  # Changes how the board shows this map. Attributes: phase, lead_id,
  # crew_ids (people of the team who work on it), promised_on,
  # promised_what, on_hold (bool), closed_reason + closed_note (close),
  # reopen (bool).
  def update_board!(attrs)
    attrs = attrs.to_h.symbolize_keys
    transaction do
      self.phase = attrs[:phase] if attrs[:phase].present?
      self.lead_id = attrs[:lead_id].presence if attrs.key?(:lead_id)
      self.promised_on = attrs[:promised_on].presence if attrs.key?(:promised_on)
      self.promised_what = attrs[:promised_what] if attrs.key?(:promised_what)
      if attrs.key?(:on_hold)
        hold = ActiveModel::Type::Boolean.new.cast(attrs[:on_hold])
        self.on_hold_since = hold ? (on_hold_since || Time.current) : nil
      end
      if attrs[:closed_reason].present?
        self.closed_at ||= Time.current
        self.closed_reason = attrs[:closed_reason]
        self.closed_note = attrs[:closed_note]
      elsif ActiveModel::Type::Boolean.new.cast(attrs[:reopen])
        self.closed_at = self.closed_reason = self.closed_note = nil
      end
      save!
      self.crew_ids = crew_candidates.where(id: Array(attrs[:crew_ids]).compact_blank).ids if attrs.key?(:crew_ids)
      # The lead always works on the project.
      assignments.find_or_create_by!(user_id: lead_id) if lead_id
    end
    self
  end

  # Who can lead or work on the project: its team's members, its owner and
  # its direct members.
  def crew_candidates
    ids = memberships.select(:user_id)
    scope = User.where(id: ids).or(User.where(id: owner_id))
    scope = scope.or(User.where(id: OrganizationMembership.where(organization_id:).select(:user_id))) if organization_id
    scope
  end

  private
    def lead_takes_part
      errors.add(:lead, :not_a_participant) unless crew_candidates.exists?(id: lead_id)
    end
end
