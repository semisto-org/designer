module Billing
  # Processes a verified Stripe event once: stored by event id, handled under
  # a lock, and never handled twice. Unknown event types are stored and
  # acknowledged. A failure raises, so the endpoint answers 500 and Stripe
  # redelivers the event later.
  module Webhook
    # "Not ready yet, deliver it again" (events can arrive out of order).
    class Retry < StandardError; end

    HANDLED_TYPES = %w[
      checkout.session.completed checkout.session.async_payment_succeeded
      invoice.paid
      customer.subscription.created customer.subscription.updated customer.subscription.deleted
      charge.refunded
    ].freeze

    module_function

    # Returns :duplicate, or a short note about what was done.
    def process(payload)
      StripeEvent.record!(payload).process_once { |event| dispatch(event) }
    end

    def dispatch(event)
      type = event.event_type
      object = event.payload.dig("data", "object") || {}
      created = Payload.time(event.payload["created"]) || Time.current

      case type
      when "checkout.session.completed", "checkout.session.async_payment_succeeded"
        Fulfillment.call(object, paid_at: created)
      when "invoice.paid"
        InvoiceRecorder.call(object, event_at: created)
      when "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"
        SubscriptionSync.call(object, synced_at: created)
      when "charge.refunded"
        RefundRecorder.call(object, event_at: created)
      else
        "ignored event type"
      end
    end
  end
end
