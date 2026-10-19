# What Semisto staff did from the admin screens: impersonations (start and
# end), role changes, and the promotion codes made or switched off (« Codes
# promo »). Kept when either user is deleted (ids nullified,
# the e-mail addresses stay in `details`).
class AdminEvent < ApplicationRecord
  ACTIONS = %w[impersonation_started impersonation_ended admin_granted admin_revoked reviewer_granted reviewer_revoked
               promotion_code_created promotion_code_deactivated plan_gifted plans_gifted plan_gift_revoked].freeze

  belongs_to :admin, class_name: "User", optional: true
  belongs_to :target_user, class_name: "User", optional: true

  validates :action, inclusion: { in: ACTIONS }

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  def self.record!(action, admin:, target: nil, request: nil, **details)
    create!(
      action:, admin:, target_user: target,
      details: { admin_email: admin&.email_address, target_email: target&.email_address }.compact.merge(details),
      ip_address: request&.remote_ip, user_agent: request&.user_agent&.truncate(255)
    )
  end

  def as_admin_json
    {
      id:, action:, createdAt: created_at.iso8601, ipAddress: ip_address,
      admin: admin ? { id: admin.id, name: admin.display_name } : { id: nil, name: details["admin_email"] },
      target: target_user ? { id: target_user.id, name: target_user.display_name } : (details["target_email"] && { id: nil, name: details["target_email"] }) ||
        (details["code"] && { id: nil, name: details["code"] }) || (details["label"] && { id: nil, name: details["label"] }),
      reason: details["reason"]
    }
  end
end
