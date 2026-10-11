class User < ApplicationRecord
  include Billable
  include AiTrial
  include HeicAttachment

  AVATAR_MAX_BYTES = 10.megabytes
  AVATAR_TYPES = %w[image/jpeg image/png image/webp].freeze
  AVATAR_SIZE = 256

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
  has_many :offer_templates, as: :owner, dependent: :destroy
  has_one :request_form, as: :owner, dependent: :destroy

  # A picture chosen in « Mon compte »; it wins over the Google one.
  has_one_attached :avatar do |attachable|
    attachable.variant :thumb, resize_to_fill: [ AVATAR_SIZE, AVATAR_SIZE ], format: :jpeg, saver: { strip: true, quality: 85 }
  end
  converts_heic :avatar
  validate :avatar_is_acceptable

  normalizes :email_address, with: ->(e) { e.strip.downcase }
  validates :email_address, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }

  # Optional: most people sign in with a link, a code or Google.
  has_secure_password validations: false
  validates :password, length: { minimum: 10, maximum: 72 }, confirmation: true, allow_nil: true

  # Who the person designs for (welcome page, « Mon compte »). Null until chosen.
  ACCOUNT_KINDS = %w[individual professional].freeze
  validates :account_kind, inclusion: { in: ACCOUNT_KINDS }, allow_nil: true

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

  def professional? = account_kind == "professional"
  def account_kind_chosen? = account_kind.present?

  def self.from_google(auth)
    info = auth.info
    user = find_by(google_uid: auth.uid) || find_or_initialize_by(email_address: info.email.to_s.downcase)
    user.google_uid ||= auth.uid
    user.name = info.name if user.name.blank?
    user.avatar_url = info.image if info.image.present?
    user.save!
    user
  end

  # The uploaded picture (served by AvatarsController), else Google's.
  def avatar_url
    return super unless avatar.attached? && avatar.blob.persisted?
    Rails.application.routes.url_helpers.avatar_path(avatar.blob.signed_id)
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
    # newRequests: the "Demandes" link shows once one of my accounts has a
    # request form, with a dot while requests wait for a first call.
    { id:, name: display_name, email: email_address, avatarUrl: avatar_url, admin:, teamsCount: organization_memberships.count,
      tourSeen: tour_seen_at.present?, accountKind: account_kind, newRequests: new_requests_count }
  end

  # Requests not called yet on the forms I read; nil without any form.
  def new_requests_count
    forms = RequestForm.where(owner: self).or(RequestForm.where(owner_type: "Organization", owner_id: organization_memberships.select(:organization_id)))
    return nil unless forms.exists?
    ProjectRequest.where(request_form: forms, status: "new").count
  end

  private
    def avatar_is_acceptable
      return unless avatar.attached?
      blob = avatar.blob
      errors.add(:avatar, I18n.t("account.avatar.errors.type")) unless AVATAR_TYPES.include?(blob.content_type)
      errors.add(:avatar, I18n.t("account.avatar.errors.size", max: AVATAR_MAX_BYTES / 1.megabyte)) if blob.byte_size > AVATAR_MAX_BYTES
    end

    def sign_in_code_digest_for(code)
      key = Rails.application.key_generator.generate_key("sign_in_code")
      OpenSSL::HMAC.hexdigest("SHA256", key, "#{id}:#{code}")
    end
end
