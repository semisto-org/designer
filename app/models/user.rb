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
  has_many :release_note_likes, dependent: :delete_all
  has_many :service_requests, dependent: :destroy
  has_many :owned_maps, class_name: "Map", foreign_key: :owner_id, inverse_of: :owner, dependent: :restrict_with_error

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  validates :email_address, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }

  # Optional: most people sign in with a link, a code or Google.
  has_secure_password validations: false
  validates :password, length: { minimum: 10, maximum: 72 }, confirmation: true, allow_nil: true

  SIGN_IN_TTL = 20.minutes
  SIGN_IN_CODE_MAX_ATTEMPTS = 5

  # The magic link: a signed token, valid 20 minutes, invalidated as soon as
  # the user signs in (last_signed_in_at changes).
  generates_token_for :magic_link, expires_in: SIGN_IN_TTL do
    last_signed_in_at
  end

  # The six-digit code sent with the magic link, to sign in on a device that
  # cannot open the e-mail. Only its digest is kept; a new one replaces the
  # previous one. Returns the code, to put in the e-mail.
  def issue_sign_in_code!
    code = format("%06d", SecureRandom.random_number(1_000_000))
    update!(sign_in_code_digest: sign_in_code_digest_for(code), sign_in_code_sent_at: Time.current, sign_in_code_attempts: 0)
    code
  end

  # True once for the right code within 20 minutes. Each wrong guess counts;
  # after five, the code is dropped and a new one must be asked for.
  def sign_in_code_matches?(code)
    return false if sign_in_code_digest.blank? || sign_in_code_sent_at.nil? || sign_in_code_sent_at < SIGN_IN_TTL.ago

    if ActiveSupport::SecurityUtils.secure_compare(sign_in_code_digest, sign_in_code_digest_for(code.to_s.gsub(/\D/, "")))
      true
    else
      attempts = sign_in_code_attempts + 1
      update_columns(sign_in_code_attempts: attempts, **(attempts >= SIGN_IN_CODE_MAX_ATTEMPTS ? { sign_in_code_digest: nil } : {}))
      false
    end
  end

  # Every way in ends here: the link and the code stop working.
  def signed_in!
    update!(last_signed_in_at: Time.current, sign_in_code_digest: nil, sign_in_code_sent_at: nil, sign_in_code_attempts: 0)
  end

  def password? = password_digest.present?

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

  private
    def sign_in_code_digest_for(code)
      key = Rails.application.key_generator.generate_key("sign_in_code")
      OpenSSL::HMAC.hexdigest("SHA256", key, "#{id}:#{code}")
    end
end
