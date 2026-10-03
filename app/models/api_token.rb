# Personal access token for MCP clients that cannot run the OAuth flow
# (scripts, self-hosted agents): `Authorization: Bearer sdp_…`. Shown once.
class ApiToken < ApplicationRecord
  PREFIX = "sdp"
  MAX_ACTIVE_PER_USER = 20
  EXPIRY_CHOICES = { "30" => 30.days, "90" => 90.days, "365" => 365.days }.freeze

  belongs_to :user

  attr_reader :plaintext

  validates :name, presence: true, length: { maximum: 80 }
  validate :scopes_known
  validate :active_limit, on: :create

  before_validation :generate_secret, on: :create

  scope :active, -> { where(revoked_at: nil).where("api_tokens.expires_at IS NULL OR api_tokens.expires_at > ?", Time.current) }
  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  def self.authenticate(plaintext)
    return nil unless plaintext.to_s.start_with?("#{PREFIX}_")
    active.find_by(token_digest: SecretDigest.digest(plaintext))
  end

  def scope_list = AiAccess.normalize(scopes)
  def access = AiAccess.level(scopes)

  def access=(level)
    self.scopes = AiAccess.scopes_for(level).join(" ")
  end

  def expires_in=(days)
    self.expires_at = EXPIRY_CHOICES[days.to_s]&.from_now
  end

  def expired? = expires_at.present? && expires_at <= Time.current
  def revoked? = revoked_at.present?

  def revoke!
    update!(revoked_at: Time.current) unless revoked?
  end

  # Throttled so a busy agent does not write on every call.
  def record_use!
    update_column(:last_used_at, Time.current) if last_used_at.nil? || last_used_at < 1.minute.ago
  end

  def as_inertia
    {
      id:, name:, hint: "#{token_hint}…", access:,
      createdAt: created_at.iso8601, lastUsedAt: last_used_at&.iso8601, expiresAt: expires_at&.iso8601
    }
  end

  private
    def generate_secret
      @plaintext = SecretDigest.generate(PREFIX)
      self.token_digest = SecretDigest.digest(@plaintext)
      self.token_hint = @plaintext.first(PREFIX.length + 5)
    end

    def scopes_known
      errors.add(:scopes, :invalid) if AiAccess.unknown(scopes).any?
    end

    def active_limit
      return unless user
      errors.add(:base, :too_many, count: MAX_ACTIVE_PER_USER) if ApiToken.active.where(user:).count >= MAX_ACTIVE_PER_USER
    end
end
