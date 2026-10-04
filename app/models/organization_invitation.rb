# An invitation to join a team, sent by an admin to an e-mail address. Same
# life cycle as a map invitation: the link in the mail is the invitation
# (whoever opens it while signed in joins), valid 30 days, renewed when sent
# again, used once.
class OrganizationInvitation < ApplicationRecord
  EXPIRES_IN = 30.days
  ROLES = OrganizationMembership::ROLES

  belongs_to :organization
  belongs_to :invited_by, class_name: "User"

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  validates :email_address, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: ROLES }
  validate :not_already_a_member, on: :create

  has_secure_token :token
  before_create { self.expires_at ||= EXPIRES_IN.from_now }

  scope :pending, -> { where(accepted_at: nil).where("expires_at IS NULL OR expires_at > ?", Time.current) }

  def accepted? = accepted_at.present?
  def expired? = expires_at.present? && expires_at <= Time.current
  def pending? = !accepted? && !expired?

  # Mails the invitation (again). Resending also renews the 30 days.
  def deliver!
    update!(last_sent_at: Time.current, expires_at: EXPIRES_IN.from_now)
    TeamInvitationMailer.invite(self).deliver_later
  end

  # Joins the team with the invited role. Never downgrades an admin.
  def accept!(user)
    transaction do
      membership = organization.memberships.find_or_initialize_by(user:)
      membership.role = role if membership.new_record? || role == "admin"
      membership.save!
      update!(accepted_at: Time.current)
      membership
    end
  end

  private
    def not_already_a_member
      return if email_address.blank? || organization.nil?
      errors.add(:email_address, :already_member) if organization.users.exists?(email_address:)
    end
end
