class MapInvitation < ApplicationRecord
  EXPIRES_IN = 30.days
  ROLES = %w[editor viewer].freeze

  belongs_to :map
  belongs_to :invited_by, class_name: "User"

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  validates :email_address, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: ROLES }
  validate :not_already_a_participant, on: :create
  validate :editor_slot_available, on: :create

  has_secure_token :token
  before_create { self.expires_at ||= EXPIRES_IN.from_now }

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
  # they signed in with: the link is the invitation. Raises
  # Map::EditorLimitReached when the map already has its editors.
  def accept!(user)
    transaction do
      membership = map.grant_access!(user, role, invited_by:)
      update!(accepted_at: Time.current)
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

    # Pending editor invitations hold a seat, so the owner cannot promise
    # a fourth one by e-mail.
    def editor_slot_available
      return unless role == "editor" && map
      if map.editor_seats_taken(except_invitation: self) >= Map::MAX_EDITORS
        errors.add(:role, :editor_limit, count: Map::MAX_EDITORS)
      end
    end
end
