# One thing to do on a design project: « Faire un test de sol »,
# « Commander les plants ». It sits in a list of the map, may be assigned to
# one participant of the map and given a due date, and carries free tags
# like the map's elements. A task Semisto adds by default has a `key` that
# names the editor panel where it is done and the step of the journey that
# says when the map shows it done (TaskList::Defaults).
class Task < ApplicationRecord
  include MapFeature::Tags

  TITLE_MAX_LENGTH = 200
  NOTES_MAX_LENGTH = 5000

  belongs_to :map
  belongs_to :task_list
  belongs_to :assignee, class_name: "User", optional: true
  belongs_to :completed_by, class_name: "User", optional: true
  belongs_to :created_by, class_name: "User", optional: true

  normalizes :title, with: ->(title) { title.to_s.squish }
  normalizes :notes, with: ->(notes) { notes.to_s.strip.presence }

  validates :title, presence: true, length: { maximum: TITLE_MAX_LENGTH }
  validates :notes, length: { maximum: NOTES_MAX_LENGTH }
  validate :list_on_the_same_map
  validate :assignee_takes_part, if: -> { assignee_id && will_save_change_to_assignee_id? }

  scope :ordered, -> { order(:position, :id) }
  scope :pending, -> { where(completed_at: nil) }
  scope :done, -> { where.not(completed_at: nil) }
  scope :overdue, ->(today = Date.current) { pending.where(due_on: ...today) }

  before_validation { self.map_id ||= task_list&.map_id }
  before_create :append_position

  def done? = completed_at.present?
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

  # `journey_done`: the journey items the map shows done (Journey#items).
  def as_json(journey_done: [])
    journey = TaskList::Defaults.journey_for(key)
    {
      id:, listId: task_list_id, title:, notes:, key:, position:, tags:,
      panel:, mapSaysDone: journey ? journey_done.include?(journey) : nil,
      dueOn: due_on&.iso8601,
      assignee: assignee && { id: assignee.id, name: assignee.display_name },
      completedAt: completed_at&.iso8601,
      completedBy: completed_by&.display_name,
      createdAt: created_at&.iso8601
    }.compact
  end

  private
    def append_position
      self.position = (Task.where(task_list_id:).maximum(:position) || -1) + 1
    end

    def renumber(tasks)
      tasks.each_with_index { |task, i| task.update_column(:position, i) }
    end

    def list_on_the_same_map
      errors.add(:task_list, :invalid) if task_list && map_id && task_list.map_id != map_id
    end

    # Only someone who takes part in the map (owner, editor, viewer, team
    # member) can be given a task on it.
    def assignee_takes_part
      errors.add(:assignee, :not_a_participant) unless map&.participants&.exists?(id: assignee_id)
    end
end
