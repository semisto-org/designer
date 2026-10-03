class MapInvitation < ApplicationRecord
  belongs_to :map
  belongs_to :invited_by, class_name: "User"

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  validates :email_address, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: %w[editor viewer] }

  has_secure_token :token
  scope :pending, -> { where(accepted_at: nil) }

  def accept!(user)
    transaction do
      membership = map.memberships.find_or_initialize_by(user:)
      membership.role = role if membership.new_record? || membership.role == "viewer"
      membership.invited_by ||= invited_by
      membership.save!
      update!(accepted_at: Time.current)
      membership
    end
  end
end
