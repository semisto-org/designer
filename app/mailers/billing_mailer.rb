class BillingMailer < ApplicationMailer
  # kind: "d30" (30 days before expiry), "d7", "expired".
  def renewal_reminder(purchase, kind)
    @user = purchase.user
    @kind = kind
    @expires_on = french_date(purchase.expires_at)
    @read_only_maps = @user.read_only_maps_count
    @billing_url = billing_url(plan: "yearly")
    show_places(@user)
    mail to: @user.email_address, subject: t(".#{kind}.subject", date: @expires_on)
  end

  # A yearly subscription renews itself in about 45 days: its date, its price
  # and how to cancel (Billing::SubscriptionRenewalReminders).
  def subscription_renewal(subscription)
    @user = subscription.user
    @plan_name = t("account.plan_names.#{subscription.plan_key}")
    @renews_on = french_date(subscription.current_period_end)
    @price = euros(Billing::Catalog.fetch(subscription.plan_key).yearly_price_cents)
    @billing_url = billing_url
    mail to: @user.email_address, subject: t(".subject", plan: @plan_name, date: @renews_on)
  end

  # The trial of AI drafts on the free plan ends in a few days.
  def ai_trial_ending(user)
    @user = user
    @ends_on = french_date(user.ai_trial_ends_at)
    @billing_url = billing_url
    @account_ai_url = account_ai_url
    mail to: @user.email_address, subject: t(".subject", date: @ends_on)
  end

  # A drone mission is a manual service: tell Semisto who ordered it.
  def drone_ordered(purchase)
    @purchase = purchase
    @user = purchase.user
    @payment = purchase.billing_payments.first
    mail to: Billing.contact_email, reply_to: @user.email_address,
      subject: t(".subject", name: @user.display_name)
  end

  private
    # "490 €", "1 290 €".
    def euros(cents)
      precision = (cents % 100).zero? ? 0 : 2
      ActiveSupport::NumberHelper.number_to_currency(cents / 100.0, unit: "€", format: "%n %u", separator: ",", delimiter: " ", precision:)
    end

    # "12 octobre 2027" (the app has no French date formats of its own).
    def french_date(time)
      date = time.in_time_zone.to_date
      "#{date.day} #{t('billing_mailer.months')[date.month - 1]} #{date.year}"
    end
end
