# One of a team's forms made elsewhere (a Tally form, by its id). Admins add
# it from its link so the team can send it from a map; a form that sends an
# answer before being added is added then, under the name Tally gives it.
class ExternalForm < ApplicationRecord
  PROVIDERS = %w[tally].freeze
  NAME_MAX_LENGTH = 120
  # tally.so/r/ID (to answer), tally.so/forms/ID(/edit…) (the builder) or the bare id.
  TALLY_ID = /\A[A-Za-z0-9]{4,20}\z/
  TALLY_LINK = %r{\Ahttps?://(?:www\.)?tally\.so/(?:r|forms|embed)/([A-Za-z0-9]{4,20})(?:[/?#].*)?\z}

  belongs_to :inbox, class_name: "FormInbox", foreign_key: :form_inbox_id
  has_many :responses, class_name: "FormResponse", dependent: :destroy

  normalizes :name, with: ->(n) { n.to_s.squish.first(NAME_MAX_LENGTH) }
  validates :provider, inclusion: { in: PROVIDERS }
  validates :external_id, presence: true, format: { with: TALLY_ID }, uniqueness: { scope: :form_inbox_id }
  validates :name, presence: true

  scope :by_name, -> { order(Arel.sql("lower(name)"), :id) }

  # The form's id from what an admin pasted: its share link, its editor's
  # address, or the id itself. Nil when it is none of these.
  def self.tally_id(text)
    text = text.to_s.strip
    return text if text.match?(TALLY_ID)
    text[TALLY_LINK, 1]
  end

  def url = "https://tally.so/r/#{external_id}"

  # The address to send for this map: Tally fills the hidden field « carte ».
  def link_for(map) = "#{url}?#{FormResponse::MAP_FIELD}=#{map.id}"
end
