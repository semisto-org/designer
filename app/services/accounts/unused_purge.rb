# Accounts nobody ever opened: an address typed under « Garder ce carnet »
# (MapTrial#claim!) or on the sign-in page, whose link and code were never
# used. After 30 days they are erased (privacy policy). An account that
# holds anything (a map, a team, a plan, a payment), that came from Google
# or Apple, or that has a password is left alone, and so is the stores'
# review account.
module Accounts
  class UnusedPurge
    AFTER = 30.days

    def self.call(at = Time.current) = new(at).call

    def initialize(at = Time.current)
      @at = at
    end

    def candidates
      scope = User.where(last_signed_in_at: nil, admin: false, google_uid: nil, apple_uid: nil, password_digest: nil)
        .where(created_at: ...(@at - AFTER))
      scope = scope.where.not(email_address: AppReview.email) if AppReview.email
      [ [ MapMembership, :user_id ], [ Map, :owner_id ], [ OrganizationMembership, :user_id ], [ PlanSubscription, :user_id ],
        [ PlanGrant, :user_id ], [ BillingPayment, :user_id ], [ Session, :user_id ] ].reduce(scope) do |kept, (model, column)|
        kept.where.not(id: model.where.not(column => nil).select(column))
      end
    end

    # Returns how many accounts were erased. One that something still holds
    # (a restriction or a foreign key) stays, and the next run tries again.
    def call
      candidates.find_each.count do |user|
        user.destroy!
        true
      rescue ActiveRecord::ActiveRecordError => e
        Rails.logger.warn("[accounts] unused account #{user.id} kept: #{e.class}")
        false
      end
    end
  end
end
