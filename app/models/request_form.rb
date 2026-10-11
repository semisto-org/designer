# A professional account's public request form (« Demande de projet »),
# at /demande/:slug: a prospect picks their parcels on a map, says who they
# are and what they want, and the account's people get a ProjectRequest to
# call back, visit, then turn into a map and an offer.
#
# Owner: a User with a professional plan, or an Organization (a team).
# One form per account.
class RequestForm < ApplicationRecord
  OWNER_TYPES = %w[User Organization].freeze
  INTRO_MAX_LENGTH = 1500

  belongs_to :owner, polymorphic: true
  has_many :project_requests, dependent: :destroy

  validates :owner_type, inclusion: { in: OWNER_TYPES }
  validates :owner_id, uniqueness: { scope: :owner_type }
  validates :slug, presence: true, uniqueness: true, format: { with: /\A[a-z0-9][a-z0-9-]{1,62}\z/ }
  validates :intro, length: { maximum: INTRO_MAX_LENGTH }

  before_validation :assign_slug, on: :create

  scope :active, -> { where(active: true) }

  def team? = owner.is_a?(Organization)

  # The name the prospect sees: the team's, or the professional's.
  def display_name = team? ? owner.name : owner.display_name

  # Who is told about a new request: the professional, or every member of
  # the team.
  def recipients = team? ? owner.users.order(:id).to_a : [ owner ]

  # Who may read the requests: the same people.
  def reader?(user) = team? ? owner.member?(user) : owner == user

  # Who may switch the form on or off and change its text.
  def writer?(user) = team? ? owner.admin?(user) : owner == user

  private
    def assign_slug
      return if slug.present?
      base = display_name.to_s.parameterize.first(50).delete_suffix("-").presence || "demande"
      base = "#{base}-demande" if base.length < 2
      candidate = base
      candidate = "#{base}-#{SecureRandom.alphanumeric(5).downcase}" while self.class.exists?(slug: candidate)
      self.slug = candidate
    end
end
