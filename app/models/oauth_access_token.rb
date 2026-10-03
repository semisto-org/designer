# A short-lived bearer token for the MCP endpoint and its rotating refresh
# token. Each refresh revokes the row and issues a new one; presenting a
# refresh token twice revokes every token of that client for the user
# (OAuth 2.1 refresh token rotation for public clients).
class OauthAccessToken < ApplicationRecord
  ACCESS_PREFIX = "sda"
  REFRESH_PREFIX = "sdr"
  ACCESS_TTL = 1.hour
  REFRESH_TTL = 90.days

  belongs_to :user
  belongs_to :oauth_client
  belongs_to :oauth_grant, optional: true

  attr_reader :plaintext_token, :plaintext_refresh_token

  validates :scopes, :expires_at, presence: true

  scope :unrevoked, -> { where(revoked_at: nil) }
  # Tokens that still give access or can be refreshed: an « authorized app ».
  scope :live, -> { unrevoked.where("oauth_access_tokens.expires_at > :now OR oauth_access_tokens.refresh_expires_at > :now", now: Time.current) }

  def self.issue!(user:, client:, scopes:, resource:, grant: nil)
    token = new(user:, oauth_client: client, oauth_grant: grant, scopes: AiAccess.normalize(scopes).join(" "), resource:)
    token.send(:generate_secrets)
    token.save!
    token
  end

  def self.authenticate(plaintext)
    return nil unless plaintext.to_s.start_with?("#{ACCESS_PREFIX}_")
    unrevoked.where("expires_at > ?", Time.current).find_by(token_digest: SecretDigest.digest(plaintext))
  end

  def self.find_by_refresh_token(plaintext)
    return nil unless plaintext.to_s.start_with?("#{REFRESH_PREFIX}_")
    find_by(refresh_token_digest: SecretDigest.digest(plaintext))
  end

  def self.revoke_all!(user:, client:)
    where(user:, oauth_client: client, revoked_at: nil).update_all(revoked_at: Time.current)
  end

  def scope_list = AiAccess.normalize(scopes)
  def revoked? = revoked_at.present?
  def refresh_expired? = refresh_expires_at.nil? || refresh_expires_at <= Time.current

  def revoke!
    update!(revoked_at: Time.current) unless revoked?
  end

  def record_use!
    update_column(:last_used_at, Time.current) if last_used_at.nil? || last_used_at < 1.minute.ago
  end

  # RFC 6749 §5.1 token response, with the plaintexts of a fresh token.
  def token_response
    {
      access_token: plaintext_token, token_type: "Bearer", expires_in: ACCESS_TTL.to_i,
      refresh_token: plaintext_refresh_token, scope: scope_list.join(" ")
    }.compact
  end

  private
    def generate_secrets
      @plaintext_token = SecretDigest.generate(ACCESS_PREFIX)
      @plaintext_refresh_token = SecretDigest.generate(REFRESH_PREFIX)
      self.token_digest = SecretDigest.digest(@plaintext_token)
      self.refresh_token_digest = SecretDigest.digest(@plaintext_refresh_token)
      self.expires_at = ACCESS_TTL.from_now
      self.refresh_expires_at = REFRESH_TTL.from_now
    end
end
