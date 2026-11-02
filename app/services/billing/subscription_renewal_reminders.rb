module Billing
  # A yearly Pro or Team subscription renews itself. The terms promise an
  # e-mail with the renewal date, its price and how to cancel, between three
  # months and one month before (French consumer code, L215-1): we write
  # 45 days before, once per renewal. A late run still writes, as long as
  # the renewal is ahead. Monthly subscriptions and ones set to end get
  # nothing.
  class SubscriptionRenewalReminders
    LEAD = 45.days
    YEARLY_MIN_PERIOD = 60.days   # a period longer than this is a yearly one

    def self.call(now: Time.current) = new(now).call

    def initialize(now)
      @now = now
    end

    # Number of reminders sent.
    def call
      PlanSubscription.where(status: PlanSubscription::ACTIVE_STATUSES, cancel_at_period_end: false)
        .where(current_period_end: @now..(@now + LEAD))
        .includes(:user)
        .sum { |subscription| remind(subscription) ? 1 : 0 }
    end

    private
      def remind(subscription)
        return false unless yearly?(subscription)
        return false if subscription.renewal_reminded_for == subscription.current_period_end

        subscription.update!(renewal_reminded_for: subscription.current_period_end)
        BillingMailer.subscription_renewal(subscription).deliver_later
        true
      end

      def yearly?(subscription)
        start, finish = subscription.current_period_start, subscription.current_period_end
        start.present? && finish.present? && finish - start > YEARLY_MIN_PERIOD
      end
  end
end
