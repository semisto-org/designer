# A team's mailbox for the answers to its own forms, made elsewhere (Tally
# first): the team keeps its forms where it likes and Designer files each
# answer in the matching map's documents.
#
# Tally posts every answer to /webhooks/tally/:token, signed with
# `signing_secret` (Tally-Signature: Base64 HMAC-SHA256 of the body). A
# hidden field « carte » carries the map's id; the link that fills it comes
# from the map's Documents page (ExternalForm#link_for).
class FormInbox < ApplicationRecord
  belongs_to :organization
  has_many :forms, class_name: "ExternalForm", dependent: :destroy
  has_many :responses, through: :forms

  has_secure_token :token, length: 32

  before_validation :assign_signing_secret, on: :create
  validates :signing_secret, presence: true

  def self.for(team) = find_or_create_by!(organization: team)

  # A new address and a new secret: the old ones stop working at once.
  def reset!
    regenerate_token
    update!(signing_secret: self.class.new_secret)
  end

  def self.new_secret = SecureRandom.alphanumeric(40)

  def signature_valid?(payload, signature)
    return false if signature.blank?
    expected = Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", signing_secret, payload))
    ActiveSupport::SecurityUtils.secure_compare(expected, signature.to_s.strip)
  end

  # The team's maps a response may be filed in.
  def maps = organization.maps.active

  private
    def assign_signing_secret
      self.signing_secret ||= self.class.new_secret
    end
end
