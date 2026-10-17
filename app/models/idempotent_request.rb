# The answer to a request the phone app may send twice (IdempotentRequests).
# Kept a week: the outbox retries within days, never later.
class IdempotentRequest < ApplicationRecord
  KEPT_FOR = 7.days

  belongs_to :user

  def self.remember(user:, key:, response:)
    where(created_at: ...KEPT_FOR.ago).delete_all
    create!(user:, key:, status: response.status, body: response.body.to_s)
  rescue ActiveRecord::RecordNotUnique
    nil
  end
end
