module Billing
  # The yearly pass is paid once and never renewed automatically, so we write
  # to its owner 30 days before expiry, 7 days before, and when it expires.
  # Safe to run every day (each reminder is sent once per pass); a pass that
  # was already renewed, or an owner on a subscription, gets nothing.
  class RenewalReminders
    EXPIRED_WINDOW = 14.days   # the "expired" e-mail is only sent shortly after expiry

    def self.call(now: Time.current) = new(now).call

    def initialize(now)
      @now = now
    end

    # Number of reminders sent.
    def call
      PlanPurchase.yearly.paid
        .where(expires_at: (@now - EXPIRED_WINDOW)..(@now + 30.days))
        .includes(:user, :billing_notices)
        .sum { |purchase| remind(purchase) ? 1 : 0 }
    end

    private
      def remind(purchase)
        kind = due_kind(purchase)
        return false if kind.nil? || purchase.billing_notices.any? { |notice| notice.kind == kind }
        return false if superseded?(purchase)

        purchase.billing_notices.create!(kind:, sent_at: @now)
        BillingMailer.renewal_reminder(purchase, kind).deliver_later
        true
      rescue ActiveRecord::RecordNotUnique
        false
      end

      def due_kind(purchase)
        remaining = purchase.expires_at - @now
        if remaining > 30.days then nil
        elsif remaining > 7.days then "d30"
        elsif remaining > 0 then "d7"
        else "expired"
        end
      end

      def superseded?(purchase)
        user = purchase.user
        user.plan_purchases.yearly.paid.where("expires_at > ?", purchase.expires_at).exists? ||
          user.current_plan_subscription(at: @now).present?
      end
  end
end
