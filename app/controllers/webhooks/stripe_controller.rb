module Webhooks
  # POST /webhooks/stripe — Stripe events. No session, no CSRF: the request is
  # authenticated by its signature (STRIPE_WEBHOOK_SECRET). Answers 2xx once
  # the event is stored and handled (or was already), 400 for a bad signature,
  # 5xx for anything Stripe should redeliver.
  class StripeController < ActionController::API
    def create
      secret = Billing.webhook_secret
      return head :service_unavailable if secret.nil?

      payload = request.raw_post
      event = verified_event(payload, secret)
      return head :bad_request if event.nil?

      result = Billing::Webhook.process(event)
      render json: { status: result.to_s }
    rescue StandardError => e
      Rails.error.report(e, handled: true, context: { stripe_event_id: event&.dig("id") })
      head :internal_server_error
    end

    private
      def verified_event(payload, secret)
        Stripe::Webhook::Signature.verify_header(payload, request.headers["Stripe-Signature"], secret, tolerance: Stripe::Webhook::DEFAULT_TOLERANCE)
        event = JSON.parse(payload)
        event if event.is_a?(Hash) && event["id"].present? && event["type"].present?
      rescue Stripe::SignatureVerificationError, JSON::ParserError
        nil
      end
  end
end
