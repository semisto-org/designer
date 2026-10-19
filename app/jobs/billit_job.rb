# Makes the Billit invoice of a payment and its credit notes
# (Billing::BillitInvoicing). Enqueued when a payment gets its Stripe invoice
# or a refund; the recurring backfill (config/recurring.yml) catches what a
# lost job or an unreachable Billit left behind, and reads whether sent
# documents were delivered.
class BillitJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  # Payments older than this are never invoiced in Billit by the backfill
  # (those paid before Billit was configured keep their Stripe invoice).
  LOOKBACK = 7.days
  # A sent document whose delivery is still unknown after this is left alone.
  DELIVERY_WATCH = 7.days
  BATCH = 50

  def self.backfill(billit: Providers::Billit.new, invoicing: Billing::BillitInvoicing.new(billit:))
    return 0 unless billit.configured?
    payments = BillingPayment.where(livemode: billit.production?, invoice_request_id: nil).where.not(stripe_invoice_id: nil)
    without_document = payments.where(paid_at: LOOKBACK.ago..).where.missing(:billit_documents)
    retrying = payments.where(id: BillitDocument.retryable.select(:billing_payment_id))
    refunded = payments.where("billing_payments.refunded_cents > COALESCE((SELECT SUM(d.amount_cents) FROM billit_documents d WHERE d.billing_payment_id = billing_payments.id AND d.kind = 'credit_note'), 0)")
      .where(id: BillitDocument.invoices.where.not(order_number: nil).select(:billing_payment_id))
    ids = without_document.pluck(:id) | retrying.pluck(:id) | refunded.pluck(:id)
    due = BillingPayment.where(id: ids).order(:paid_at).limit(BATCH).to_a
    due.each { |payment| new.perform(payment, invoicing:) }

    BillitDocument.where(status: "sent", sent_at: DELIVERY_WATCH.ago..).find_each { |document| invoicing.refresh(document) }
    due.size
  end

  def perform(payment, invoicing: Billing::BillitInvoicing.new)
    payment.with_lock do
      invoicing.invoice(payment)
      invoicing.credit(payment)
    end
  end
end
