class MapMembership < ApplicationRecord
  ROLES = %w[owner editor viewer].freeze

  belongs_to :map
  belongs_to :user
  belongs_to :invited_by, class_name: "User", optional: true

  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :map_id }
  # Tasks given to this person's address before they joined become theirs.
  after_create { Task.hand_over!(user, emails: user.email_address, maps: map_id) }
  # The place's sharing ends with its last owner (MapPlaceOwners).
  after_update :withdraw_place_sharing, if: -> { saved_change_to_place_owner?(to: false) }
  after_destroy :withdraw_place_sharing, if: :place_owner?

  private
    def withdraw_place_sharing
      Map.find_by(id: map_id)&.withdraw_place_sharing_without_owners!
    end
end
