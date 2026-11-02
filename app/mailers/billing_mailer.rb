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

  # The trial of AI drafts on the free plan ends in a few days.
  def ai_trial_ending(user)
    @user = user
    @ends_on = french_date(user.ai_trial_ends_at)
    @billing_url = billing_url
    @account_ai_url = account_ai_url
    mail to: @user.email_address, subject: t(".subject", date: @ends_on)
  end

  # A plan just started: what it opens, until when, and where to manage it.
  # Stripe sends the receipt; this says what the money unlocks. Sent for a
  # yearly pass (starts_at later than now when renewed early) and when a
  # subscription starts giving access or changes plan.
  def plan_started(user, plan_key, ends_at: nil, starts_at: nil)
    @user = user
    @plan_key = plan_key
    @plan_name = t("billing.plans.#{plan_key}.name")
    @features = t("billing.plans.#{plan_key}.features").values
    @ends_on = ends_at && french_date(ends_at)
    @renewed_from = french_date(starts_at) if starts_at && starts_at > Time.current + 1.day
    @maps_url = maps_url
    @billing_url = billing_url
    show_places(@user)
    mail to: @user.email_address, subject: t(".subject", plan: @plan_name)
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
    # "12 octobre 2027" (the app has no French date formats of its own).
    def french_date(time)
      date = time.in_time_zone.to_date
      "#{date.day} #{t('billing_mailer.months')[date.month - 1]} #{date.year}"
    end
end
