# A professional's or a team's way of pricing offers (Offer::Pricing):
# rates, tasks and their hours, the time the Designer saves, plant prices,
# complexity scoring and terms. An account may have several (« Particulier »,
# « Commune »…); the project sheet's profile picks the one an offer starts
# with. An account without any prices with Semisto's.
#
# Owner: a User (their own maps) or an Organization (the team's maps).
class OfferTemplate < ApplicationRecord
  OWNER_TYPES = %w[User Organization].freeze

  belongs_to :owner, polymorphic: true
  has_many :offers, dependent: :nullify

  validates :name, presence: true, length: { maximum: 80 }
  validates :owner_type, inclusion: { in: OWNER_TYPES }

  before_validation :normalize

  scope :ordered, -> { order(:position, :id) }

  # The account an offer of this map is priced by: its team, else its owner.
  def self.account_for(map) = map.organization || map.owner

  # The template a new offer starts with: the one for the client's profile,
  # else the account's first, else none (Semisto's pricing).
  def self.pick(account, client_type)
    templates = where(owner: account).ordered.to_a
    templates.find { client_type && _1.client_types.include?(client_type) } || templates.first
  end

  # A copy of Semisto's pricing, or of another template, for an account.
  def self.copy_for(account, from: nil, name: nil)
    new(owner: account, name: name || from&.name || I18n.t("offers.templates.semisto_name"),
        client_types: from&.client_types || [], data: (from&.pricing || Offer::Pricing.semisto).to_h.deep_dup,
        position: (where(owner: account).maximum(:position) || -1) + 1)
  end

  def pricing = @pricing ||= Offer::Pricing.new(data)

  def data=(value)
    @pricing = nil
    super
  end

  private
    def normalize
      self.data = Offer::Pricing.new(data).to_h
      self.client_types = Array(client_types).map(&:to_s) & Offer::Pricing::CLIENT_TYPES
    end
end
