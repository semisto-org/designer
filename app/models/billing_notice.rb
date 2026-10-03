# A renewal e-mail already sent for a yearly pass: the unique index makes the
# daily reminder job idempotent.
class BillingNotice < ApplicationRecord
  KINDS = %w[d30 d7 expired].freeze

  belongs_to :plan_purchase

  validates :kind, inclusion: { in: KINDS }
  validates :kind, uniqueness: { scope: :plan_purchase_id }
end
