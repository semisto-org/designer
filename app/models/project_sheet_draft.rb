# An answer an AI proposed for one field of a map's project sheet (MCP
# propose_project_sheet), waiting for a human: accepted, it is merged into
# the sheet like a human edit; refused, it disappears. One pending value per
# field: a new proposal for the same field replaces the previous one.
class ProjectSheetDraft < ApplicationRecord
  belongs_to :map
  belongs_to :created_by, class_name: "User", optional: true

  validates :section, inclusion: { in: ProjectSheet::SECTIONS.keys }
  validates :field, uniqueness: { scope: %i[map_id section] }
  validates :rationale, presence: true, length: { maximum: 2000 }
  validate :value_fits_the_sheet

  scope :ordered, -> { order(:id) }

  # Merges the drafts into the map's sheet (one patch, under the map's lock)
  # and removes them. Returns the new sheet.
  def self.accept!(map, drafts)
    sheet = nil
    map.with_lock do
      patch = drafts.each_with_object({}) { |d, acc| (acc[d.section] ||= {})[d.field] = d.value }
      sheet = ProjectSheet.merge(map.project, patch)
      map.update!(project: sheet.to_h)
      where(id: drafts.map(&:id)).delete_all
    end
    sheet
  end

  def as_json(*)
    {
      id:, section:, field:, value:, rationale:,
      author: created_by&.display_name, clientName: client_name, createdAt: created_at&.iso8601
    }
  end

  private
    def value_fits_the_sheet
      definition = ProjectSheet::SECTIONS[section]&.find { |f| f.key == field }
      return errors.add(:field, :inclusion) unless definition
      sheet = ProjectSheet.parse({ section => { field => value } })
      if !sheet.valid?
        errors.add(:value, :invalid)
      elsif !TypedSchema.answered?(sheet.section(section)[field])
        errors.add(:value, :blank)
      end
    end
end
