class User < ApplicationRecord
  include Billable
  include AiTrial

  has_many :sessions, dependent: :destroy
  has_many :organization_memberships, dependent: :destroy
  has_many :organizations, through: :organization_memberships
  has_many :map_memberships, dependent: :destroy
  has_many :maps, through: :map_memberships
  has_many :comments, foreign_key: :author_id, inverse_of: :author, dependent: :restrict_with_error
  has_many :comment_subscriptions, dependent: :destroy
  has_many :comment_reads, dependent: :destroy
  has_many :applauses, dependent: :destroy
  has_many :service_requests, dependent: :destroy
  has_many :owned_maps, class_name: "Map", foreign_key: :owner_id, inverse_of: :owner, dependent: :restrict_with_error

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  validates :email_address, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }

  # Passwordless sign-in: a signed token, valid 20 minutes, invalidated as
  # soon as the user signs in (last_signed_in_at changes).
  generates_token_for :magic_link, expires_in: 20.minutes do
    last_signed_in_at
  end

  def self.from_google(auth)
    info = auth.info
    user = find_by(google_uid: auth.uid) || find_or_initialize_by(email_address: info.email.to_s.downcase)
    user.google_uid ||= auth.uid
    user.name = info.name if user.name.blank?
    user.avatar_url = info.image if info.image.present?
    user.save!
    user
  end

  def display_name
    name.presence || email_address.split("@").first
  end

  def entitlements
    @entitlements ||= Entitlements.for(self)
  end

  # Has plugged an assistant on their maps (an authorized OAuth app or a
  # personal access token still valid).
  def ai_connected?
    OauthAccessToken.live.where(user: self).exists? || ApiToken.active.where(user: self).exists?
  end

  def as_inertia
    # teamsCount: the "Équipes" link shows in the main nav once you are in a team.
    { id:, name: display_name, email: email_address, avatarUrl: avatar_url, admin:, teamsCount: organization_memberships.count,
      tourSeen: tour_seen_at.present? }
  end
end
