class MapMembership < ApplicationRecord
  ROLES = %w[owner editor viewer].freeze

  belongs_to :map
  belongs_to :user
  belongs_to :invited_by, class_name: "User", optional: true

  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :map_id }
  validate :editor_limit, if: -> { role == "editor" && (new_record? || will_save_change_to_role?) }

  private
    def editor_limit
      if map.memberships.where(role: "editor").where.not(id:).count >= Map::MAX_EDITORS
        errors.add(:role, :editor_limit, count: Map::MAX_EDITORS)
      end
    end
end
