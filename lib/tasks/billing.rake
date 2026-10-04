namespace :billing do
  desc "Send the yearly pass renewal reminders due today (30 days, 7 days, expired)"
  task renewal_reminders: :environment do
    sent = Billing::RenewalReminders.call
    puts "#{sent} renewal reminder(s) queued"
  end

  desc "Delete processed Stripe webhook payloads older than 90 days"
  task purge_events: :environment do
    puts "#{StripeEvent.purge_old!} event(s) deleted"
  end

  desc "Payments ledger (revenue share): billing:payments FROM=2026-10-01 TO=2026-11-01 (TO excluded)"
  task payments: :environment do
    from = Time.zone.parse(ENV.fetch("FROM", Time.zone.now.beginning_of_month.to_s))
    to = Time.zone.parse(ENV.fetch("TO", (from + 1.month).to_s))
    puts %w[paid_at plan promotion_code currency amount_cents tax_cents net_cents refunded_cents stripe_invoice_id invoice_request_id].join(",")
    BillingPayment.live.between(from, to).order(:paid_at).each do |payment|
      puts [ payment.paid_at.iso8601, payment.plan_key, payment.promotion_code, payment.currency, payment.amount_cents,
             payment.tax_cents, payment.net_cents, payment.refunded_cents, payment.stripe_invoice_id, payment.invoice_request_id ].join(",")
    end
  end
end
