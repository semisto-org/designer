# A frozen version of an offer (V1, V2…): the inputs, the map's measures
# and the budget as they were when the team saved it. Only its status and
# note change afterwards.
class OfferVersion < ApplicationRecord
  STATUSES = %w[saved sent accepted declined].freeze

  belongs_to :offer
  belongs_to :created_by, class_name: "User", optional: true

  validates :number, numericality: { only_integer: true, greater_than: 0 }, uniqueness: { scope: :offer_id }
  validates :status, inclusion: { in: STATUSES }
  validates :note, length: { maximum: 200 }

  normalizes :note, with: ->(n) { n.to_s.squish.presence }

  def label = "V#{number}"
end
