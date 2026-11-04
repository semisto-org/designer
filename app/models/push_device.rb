# A phone where the person signed in to Semisto's app: its Expo push token,
# so a discussion message can reach the phone (Collab::ChatPush). The app
# registers it after sign-in and forgets it on sign-out; a token Expo says is
# no longer registered is dropped.
class PushDevice < ApplicationRecord
  PLATFORMS = %w[ios android].freeze

  belongs_to :user

  validates :token, presence: true, length: { maximum: 255 }, format: { with: /\A(Exponent|Expo)PushToken\[[^\]]+\]\z/ }
  validates :platform, inclusion: { in: PLATFORMS }, allow_nil: true

  # Registers the token for this user (a phone handed over to another account
  # moves with it).
  def self.register!(user, token:, platform: nil)
    device = find_or_initialize_by(token:)
    device.update!(user:, platform: (platform if PLATFORMS.include?(platform)), last_seen_at: Time.current)
    device
  rescue ActiveRecord::RecordNotUnique
    retry
  end
end
