class MapInvitation < ApplicationRecord
  EXPIRES_IN = 30.days
  ROLES = %w[editor viewer].freeze

  belongs_to :map
  belongs_to :invited_by, class_name: "User"

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  validates :email_address, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: ROLES }
  validate :not_already_a_participant, on: :create

  has_secure_token :token
  before_create { self.expires_at ||= EXPIRES_IN.from_now }
  # Tasks given to this address wait for it only while it is invited.
  after_destroy { Task.release_invitee!(email_address, maps: map_id) }

  scope :pending, -> { where(accepted_at: nil).where("expires_at IS NULL OR expires_at > ?", Time.current) }

  def accepted? = accepted_at.present?
  def expired? = expires_at.present? && expires_at <= Time.current
  def pending? = !accepted? && !expired?

  # Mails the invitation (again). Resending also renews the 30 days.
  def deliver!
    update!(last_sent_at: Time.current, expires_at: EXPIRES_IN.from_now)
    MapInvitationMailer.invite(self).deliver_later
  end

  # Whoever opens the link while signed in joins, whatever e-mail address
  # they signed in with: the link is the invitation. The tasks given to the
  # invited address become theirs.
  def accept!(user)
    transaction do
      membership = map.grant_access!(user, role, invited_by:)
      # Invited as an owner of the place: they become one on joining.
      membership&.update!(place_owner: true) if place_owner?
      update!(accepted_at: Time.current)
      Task.hand_over!(user, emails: [ email_address, user.email_address ], maps: map_id)
      membership
    end
  end

  private
    def not_already_a_participant
      return if email_address.blank?
      if map.participants.exists?(email_address:)
        errors.add(:email_address, :already_participant)
      end
    end
end
