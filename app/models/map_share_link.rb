# The "anyone with this link" invitation of a map: bound to one role, can be
# switched off or reset (new token) by the owner at any time.
class MapShareLink < ApplicationRecord
  ROLES = %w[viewer editor].freeze

  belongs_to :map
  belongs_to :created_by, class_name: "User", optional: true

  has_secure_token :token
  validates :role, inclusion: { in: ROLES }

  scope :active, -> { where(disabled_at: nil) }

  def enabled? = disabled_at.nil?
  def enable! = update!(disabled_at: nil)
  def disable! = update!(disabled_at: Time.current)

  # A new token: copies of the old link stop working.
  def reset!
    regenerate_token
    update!(disabled_at: nil)
  end

  def change_role!(new_role)
    update!(role: new_role)
    regenerate_token if saved_change_to_role?
  end

  def accept!(user)
    raise ActiveRecord::RecordNotFound unless enabled?
    map.grant_access!(user, role, invited_by: created_by)
  end
end
