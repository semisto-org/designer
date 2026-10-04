module Billing
  # The yearly pass is paid once and never renewed automatically, and neither
  # is a plan paid on invoice (PlanGrant), so we write to their owner 30 days
  # before the end, 7 days before, and when it ends. Safe to run every day
  # (each reminder is sent once per pass or grant); one that was already
  # renewed, or an owner on a subscription, gets nothing.
  class RenewalReminders
    EXPIRED_WINDOW = 14.days   # the "expired" e-mail is only sent shortly after expiry

    def self.call(now: Time.current) = new(now).call

    def initialize(now)
      @now = now
    end

    # Number of reminders sent.
    def call
      window = (@now - EXPIRED_WINDOW)..(@now + 30.days)
      passes = PlanPurchase.yearly.paid.where(expires_at: window).includes(:user, :billing_notices)
      grants = PlanGrant.not_revoked.where(ends_at: window).includes(:user, :billing_notices)
      passes.sum { |purchase| remind(purchase, purchase.expires_at) ? 1 : 0 } +
        grants.sum { |grant| remind(grant, grant.ends_at) ? 1 : 0 }
    end

    private
      def remind(subject, ends_at)
        kind = due_kind(ends_at)
        return false if kind.nil? || subject.billing_notices.any? { |notice| notice.kind == kind }
        return false if superseded?(subject.user, ends_at)

        subject.billing_notices.create!(kind:, sent_at: @now)
        if subject.is_a?(PlanGrant)
          InvoicingMailer.grant_reminder(subject, kind).deliver_later
        else
          BillingMailer.renewal_reminder(subject, kind).deliver_later
        end
        true
      rescue ActiveRecord::RecordNotUnique
        false
      end

      def due_kind(ends_at)
        remaining = ends_at - @now
        if remaining > 30.days then nil
        elsif remaining > 7.days then "d30"
        elsif remaining > 0 then "d7"
        else "expired"
        end
      end

      # Something that goes on after this end date: a later pass or grant,
      # or a subscription.
      def superseded?(user, ends_at)
        user.plan_purchases.yearly.paid.where("expires_at > ?", ends_at).exists? ||
          user.plan_grants.not_revoked.where("ends_at > ?", ends_at).exists? ||
          user.current_plan_subscription(at: @now).present?
      end
  end
end
