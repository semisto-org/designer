# One thing to do on a design project: « Faire un test de sol »,
# « Commander les plants ». It sits in a list of the map, may be assigned to
# one participant of the map (or, until they join, to someone invited to
# the map or its team: `invitee_email`) and given a due date, and carries free tags
# like the map's elements. A task Semisto adds by default has a `key` that
# names the editor panel where it is done and the step of the journey that
# says when the map shows it done (TaskList::Defaults). A task can be about
# elements of its map (« Tailler les pommiers 7 et 9 »): `features`.
class Task < ApplicationRecord
  include MapFeature::Tags

  TITLE_MAX_LENGTH = 200
  # A season step drawn on the team board's timeline: it has a start date as
  # well as its due date (« Plantation du 1er décembre au 31 janvier »).
  STEP_KINDS = %w[design site plant].freeze
  NOTES_MAX_LENGTH = 5000
  MAX_FEATURES = 200

  belongs_to :map
  belongs_to :task_list
  belongs_to :assignee, class_name: "User", optional: true
  belongs_to :completed_by, class_name: "User", optional: true
  belongs_to :created_by, class_name: "User", optional: true
  has_many :task_features, dependent: :delete_all
  has_many :features, -> { order(:id) }, through: :task_features, source: :map_feature

  normalizes :title, with: ->(title) { title.to_s.squish }
  normalizes :notes, with: ->(notes) { notes.to_s.strip.presence }
  normalizes :invitee_email, with: ->(email) { email.to_s.strip.downcase.presence }

  validates :title, presence: true, length: { maximum: TITLE_MAX_LENGTH }
  validates :notes, length: { maximum: NOTES_MAX_LENGTH }
  validates :step_kind, inclusion: { in: STEP_KINDS }, allow_nil: true
  validates :starts_on, :due_on, presence: true, if: :step_kind
  validate :starts_before_due
  validate :list_on_the_same_map
  validate :features_on_the_same_map
  validate :assignee_takes_part, if: -> { assignee_id && will_save_change_to_assignee_id? }
  validate :invitee_is_invited, if: -> { invitee_email && will_save_change_to_invitee_email? }

  scope :ordered, -> { order(:position, :id) }
  scope :pending, -> { where(completed_at: nil) }
  scope :done, -> { where.not(completed_at: nil) }
  scope :overdue, ->(today = Date.current) { pending.where(due_on: ...today) }
  scope :steps, -> { where.not(step_kind: nil) }
  scope :about, ->(feature_ids) { where(id: TaskFeature.where(map_feature_id: feature_ids).select(:task_id)) }

  before_validation { self.map_id ||= task_list&.map_id }
  before_validation :keep_one_assignee
  before_create :append_position

  # Gives the tasks waiting for `emails` on `maps` to `user`, who just joined
  # them (an invitation accepted, a membership added).
  def self.hand_over!(user, emails:, maps:)
    emails = Array(emails).compact_blank.map { _1.to_s.downcase }.uniq
    return 0 if emails.empty?
    where(map_id: maps, invitee_email: emails)
      .update_all(assignee_id: user.id, invitee_email: nil, updated_at: Time.current)
  end

  # Frees the tasks waiting for `email` on `maps` once nobody invites that
  # address there any more (the invitation was withdrawn).
  def self.release_invitee!(email, maps:)
    where(map_id: maps, invitee_email: email.to_s.downcase).includes(:map).find_each do |task|
      task.update_columns(invitee_email: nil) unless task.map.invitee_emails.include?(task.invitee_email)
    end
  end

  def done? = completed_at.present?
  def assigned? = assignee_id.present? || invitee_email.present?
  def overdue?(today = Date.current) = !done? && due_on.present? && due_on < today

  # Ticks or unticks the task, remembering who did it.
  def completed=(value)
    if ActiveModel::Type::Boolean.new.cast(value)
      self.completed_at ||= Time.current
    else
      self.completed_at = nil
      self.completed_by = nil
    end
  end

  # Moves the task to `list` (another list of the same map, or its own) at
  # `index` (0-based, clamped), renumbering the lists it leaves and joins.
  def move_to!(list, index)
    transaction do
      source = task_list
      update!(task_list: list)
      siblings = list.tasks.reload.where.not(id:).to_a
      siblings.insert(index.to_i.clamp(0, siblings.size), self)
      renumber(siblings)
      renumber(source.tasks.reload.to_a) unless source.id == list.id
    end
  end

  # The editor panel where a default task is done (« Ouvrir dans la carte »).
  def panel = TaskList::Defaults.panel_for(key)

  # `journey_done`: the journey items the map shows done (Journey#items);
  # `labels`: the names of the linked elements (MapFeature.labels_for).
  def as_json(journey_done: [], labels: nil)
    journey = TaskList::Defaults.journey_for(key)
    {
      id:, listId: task_list_id, title:, notes:, key:, position:, tags:,
      panel:, mapSaysDone: journey ? journey_done.include?(journey) : nil,
      dueOn: due_on&.iso8601,
      startsOn: starts_on&.iso8601,
      stepKind: step_kind,
      assignee: assignee_json,
      completedAt: completed_at&.iso8601,
      completedBy: completed_by&.display_name,
      createdAt: created_at&.iso8601,
      features: features_json(labels).presence
    }.compact
  end

  # The elements the task is about, with the label the map shows them by.
  def features_json(labels = nil)
    linked = features.to_a
    labels ||= MapFeature.labels_for(linked)
    linked.map { |feature| { id: feature.id, kind: feature.kind, label: labels[feature.id] } }
  end

  private
    # Someone with an account, or an address invited to the map that waits
    # for its account (« invité·e »).
    def assignee_json
      if assignee
        { id: assignee.id, name: assignee.display_name, avatarUrl: assignee.avatar_url }.compact
      elsif invitee_email
        { email: invitee_email, name: invitee_email, invited: true }
      end
    end

    # A task goes to one person: giving it to an account frees the invited
    # address, and the other way round.
    def keep_one_assignee
      if invitee_email && will_save_change_to_invitee_email?
        self.assignee_id = nil
      elsif assignee_id && will_save_change_to_assignee_id?
        self.invitee_email = nil
      end
    end

    def append_position
      self.position = (Task.where(task_list_id:).maximum(:position) || -1) + 1
    end

    def renumber(tasks)
      tasks.each_with_index { |task, i| task.update_column(:position, i) }
    end

    def starts_before_due
      errors.add(:starts_on, :after_due) if starts_on && due_on && starts_on > due_on
    end

    def list_on_the_same_map
      errors.add(:task_list, :invalid) if task_list && map_id && task_list.map_id != map_id
    end

    def features_on_the_same_map
      linked = features.to_a
      errors.add(:features, :too_many, count: MAX_FEATURES) if linked.size > MAX_FEATURES
      errors.add(:features, :other_map) if map_id && linked.any? { |feature| feature.map_id != map_id || feature.status == "rejected" }
    end

    # Only someone who takes part in the map (owner, editor, viewer, team
    # member) can be given a task on it.
    def assignee_takes_part
      errors.add(:assignee, :not_a_participant) unless map&.participants&.exists?(id: assignee_id)
    end

    # An address can wait for its account only while the map or its team
    # invites it.
    def invitee_is_invited
      errors.add(:invitee_email, :not_invited) unless map&.invitee_emails&.include?(invitee_email)
    end
end
