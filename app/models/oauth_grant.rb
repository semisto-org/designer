# An authorization code: what the consent page hands to the client, to be
# exchanged once, within minutes, with the PKCE verifier that matches the
# challenge sent at the start of the flow.
class OauthGrant < ApplicationRecord
  TTL = 5.minutes

  belongs_to :user
  belongs_to :oauth_client
  has_many :access_tokens, class_name: "OauthAccessToken", dependent: :nullify

  attr_reader :plaintext_code

  validates :redirect_uri, :code_challenge, :scopes, :expires_at, presence: true
  validates :code_challenge_method, inclusion: { in: %w[S256] }

  before_validation :generate_code, on: :create

  def self.find_by_code(code)
    find_by(code_digest: SecretDigest.digest(code)) if code.present?
  end

  def expired? = expires_at <= Time.current
  def used? = used_at.present?
  def scope_list = AiAccess.normalize(scopes)

  def verify_pkce(verifier)
    return false unless verifier.is_a?(String) && verifier.match?(/\A[A-Za-z0-9\-._~]{43,128}\z/)
    computed = Base64.urlsafe_encode64(OpenSSL::Digest::SHA256.digest(verifier), padding: false)
    ActiveSupport::SecurityUtils.secure_compare(computed, code_challenge)
  end

  # Marks the code used; false when another request redeemed it first.
  def redeem!
    self.class.where(id:, used_at: nil).update_all(used_at: Time.current) == 1
  end

  private
    def generate_code
      @plaintext_code = SecretDigest.generate
      self.code_digest = SecretDigest.digest(@plaintext_code)
      self.expires_at ||= TTL.from_now
    end
end
