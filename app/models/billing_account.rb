# The link between a user and their Stripe customer (one per user).
class BillingAccount < ApplicationRecord
  belongs_to :user

  validates :stripe_customer_id, presence: true, uniqueness: true
end
