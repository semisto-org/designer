# A renewal e-mail already sent for a yearly pass or for a plan granted on
# invoice (one of the two): the unique indexes make the daily reminder job
# idempotent.
class BillingNotice < ApplicationRecord
  KINDS = %w[d30 d7 expired].freeze

  belongs_to :plan_purchase, optional: true
  belongs_to :plan_grant, optional: true

  validates :kind, inclusion: { in: KINDS }
  validates :kind, uniqueness: { scope: :plan_purchase_id }, if: :plan_purchase_id
  validates :kind, uniqueness: { scope: :plan_grant_id }, if: :plan_grant_id
  validate :one_subject

  private
    def one_subject
      errors.add(:base, :subject) unless [ plan_purchase_id, plan_grant_id ].compact.one?
    end
end
