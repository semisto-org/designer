# An application that registered itself through OAuth dynamic client
# registration (RFC 7591) to act on a user's maps: claude.ai, Claude
# Desktop, Claude Code or any MCP client. Its name is self-declared, so the
# consent page also shows where the user will be sent back.
class OauthClient < ApplicationRecord
  AUTH_METHODS = %w[none client_secret_post client_secret_basic].freeze
  GRANT_TYPES = %w[authorization_code refresh_token].freeze
  RESPONSE_TYPES = %w[code].freeze
  MAX_REDIRECT_URIS = 10
  FORBIDDEN_SCHEMES = %w[javascript data file vbscript about blob ftp ws wss mailto].freeze
  LOOPBACK_HOSTS = %w[localhost 127.0.0.1 [::1] ::1].freeze
  METADATA_KEYS = %w[client_uri software_id software_version scope].freeze

  has_many :grants, class_name: "OauthGrant", dependent: :delete_all
  has_many :access_tokens, class_name: "OauthAccessToken", dependent: :delete_all

  attr_reader :plaintext_secret

  validates :client_id, :name, presence: true
  validates :name, length: { maximum: 100 }
  validates :token_endpoint_auth_method, inclusion: { in: AUTH_METHODS }
  validate :redirect_uris_valid
  validate :grant_types_supported

  before_validation :generate_credentials, on: :create

  class RegistrationError < StandardError
    attr_reader :code
    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  # RFC 7591 registration from the client's JSON metadata.
  def self.register!(params)
    params = params.to_h.stringify_keys
    uris = params["redirect_uris"]
    unless uris.is_a?(Array) && uris.any? && uris.all? { |u| u.is_a?(String) }
      raise RegistrationError.new("invalid_redirect_uri", "redirect_uris must be a non-empty array of strings")
    end
    response_types = Array(params["response_types"].presence || RESPONSE_TYPES)
    unless (response_types - RESPONSE_TYPES).empty?
      raise RegistrationError.new("invalid_client_metadata", "only the code response type is supported")
    end
    client = new(
      name: params["client_name"].to_s.strip.squish.presence&.first(100) || "Client MCP",
      redirect_uris: uris,
      # RFC 7591 §2: client_secret_basic when the client does not say.
      token_endpoint_auth_method: params["token_endpoint_auth_method"].presence || "client_secret_basic",
      grant_types: Array(params["grant_types"].presence || %w[authorization_code refresh_token]).map(&:to_s),
      metadata: params.slice(*METADATA_KEYS).transform_values { |v| v.to_s.first(300) }
    )
    unless client.save
      code = client.errors.include?(:redirect_uris) ? "invalid_redirect_uri" : "invalid_client_metadata"
      raise RegistrationError.new(code, client.errors.full_messages.to_sentence)
    end
    client
  end

  # A redirect URI a client may register: https, http on loopback only (a
  # native app's local server), or a private-use scheme (cursor://…).
  def self.acceptable_redirect_uri?(value)
    return false if value.to_s.length > 2000
    uri = URI.parse(value.to_s)
    return false if uri.scheme.blank? || uri.fragment.present? || FORBIDDEN_SCHEMES.include?(uri.scheme.downcase)
    case uri.scheme.downcase
    when "https" then uri.host.present?
    when "http" then LOOPBACK_HOSTS.include?(uri.host.to_s.downcase)
    else uri.scheme.match?(/\A[a-z][a-z0-9+.\-]*\z/i)
    end
  rescue URI::InvalidURIError
    false
  end

  def self.loopback?(uri)
    uri.scheme == "http" && LOOPBACK_HOSTS.include?(uri.host.to_s.downcase)
  end

  def self.find_by_client_id(client_id)
    find_by(client_id: client_id.to_s) if client_id.present?
  end

  def confidential? = token_endpoint_auth_method != "none"

  def authenticate_secret(secret)
    SecretDigest.matches?(secret, client_secret_digest)
  end

  # Exact match, except that the port of a loopback redirect may change
  # between runs of a native app (RFC 8252 §7.3).
  def redirect_uri_allowed?(value)
    return false if value.blank?
    redirect_uris.any? do |registered|
      next true if registered == value
      a = URI.parse(registered)
      b = URI.parse(value)
      self.class.loopback?(a) && self.class.loopback?(b) &&
        a.host.downcase == b.host.downcase && a.path == b.path && a.query == b.query
    rescue URI::InvalidURIError
      false
    end
  end

  def default_redirect_uri
    redirect_uris.first if redirect_uris.size == 1
  end

  def redirect_host
    uri = URI.parse(redirect_uris.first.to_s)
    uri.host.presence || "#{uri.scheme}://"
  rescue URI::InvalidURIError
    nil
  end

  def registration_response
    {
      client_id:, client_id_issued_at: created_at.to_i,
      client_name: name, redirect_uris:, grant_types:,
      response_types: RESPONSE_TYPES, token_endpoint_auth_method:
    }.merge(metadata.symbolize_keys.except(:scope))
      .merge(plaintext_secret ? { client_secret: plaintext_secret, client_secret_expires_at: 0 } : {})
  end

  private
    def generate_credentials
      self.client_id ||= SecretDigest.generate("sdc").first(36)
      if confidential? && client_secret_digest.blank?
        @plaintext_secret = SecretDigest.generate("sds")
        self.client_secret_digest = SecretDigest.digest(@plaintext_secret)
      end
    end

    def redirect_uris_valid
      uris = Array(redirect_uris)
      if uris.empty? || uris.size > MAX_REDIRECT_URIS || !uris.all? { |u| self.class.acceptable_redirect_uri?(u) }
        errors.add(:redirect_uris, :invalid)
      end
    end

    def grant_types_supported
      errors.add(:grant_types, :invalid) unless Array(grant_types).any? && (Array(grant_types) - GRANT_TYPES).empty?
    end
end
