# A section of a column of the team board: the team's own split of a phase
# (« Pré-design », « Design détaillé » in « Design »). Any member of the team
# creates, renames, orders and deletes them. A project belongs to at most one
# section, always of its own phase (MapBoard): it leaves the section when it
# moves to another column. « En veille », at the bottom of every column, is
# not a section: it gathers the projects on hold, whatever their section.
class BoardSection < ApplicationRecord
  NAME_MAX_LENGTH = 40
  # Per column: beyond this, a column is a list of headings, not of projects.
  MAX_PER_PHASE = 8

  belongs_to :organization
  has_many :maps, dependent: :nullify

  normalizes :name, with: ->(name) { name.to_s.squish }

  validates :phase, inclusion: { in: MapBoard::PHASES }
  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH }
  validate :room_in_the_column, on: :create

  scope :ordered, -> { order(:position, :id) }

  before_create -> { self.position = (organization.board_sections.where(phase:).maximum(:position) || -1) + 1 }

  # Moves the section one place up (-1) or down (+1) in its column.
  def shift!(by)
    siblings = organization.board_sections.where(phase:).ordered.to_a
    index = siblings.index(self)
    target = index + by.to_i.clamp(-1, 1)
    return self if target.negative? || target >= siblings.size || target == index
    siblings.insert(target, siblings.delete_at(index))
    transaction { siblings.each_with_index { |section, i| section.update_column(:position, i) if section.position != i } }
    reload
  end

  def as_board_json = { id:, phase:, name:, position: }

  private
    def room_in_the_column
      return unless organization && organization.board_sections.where(phase:).count >= MAX_PER_PHASE
      errors.add(:base, :too_many_sections, count: MAX_PER_PHASE)
    end
end
