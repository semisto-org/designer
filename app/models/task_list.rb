# A list of tasks on a map (« Tâches »): the four lists Semisto adds by
# default, one per step of the journey, and any list the team makes
# (« Chantier de mars », « Devis »…). `key` marks a default list.
class TaskList < ApplicationRecord
  NAME_MAX_LENGTH = 80

  belongs_to :map
  belongs_to :created_by, class_name: "User", optional: true
  has_many :tasks, -> { ordered }, dependent: :delete_all, inverse_of: :task_list

  normalizes :name, with: ->(name) { name.to_s.squish }
  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH }

  scope :ordered, -> { order(:position, :id) }

  before_create :append_position

  # Puts the list at `index` among the map's lists (0-based, clamped).
  def move_to!(index)
    transaction do
      others = map.task_lists.ordered.where.not(id:).to_a
      others.insert(index.to_i.clamp(0, others.size), self)
      others.each_with_index { |list, i| list.update_column(:position, i) }
      reload
    end
  end

  def as_json(*)
    { id:, name:, key:, position: }
  end

  private
    def append_position
      self.position = (map.task_lists.maximum(:position) || -1) + 1
    end
end
