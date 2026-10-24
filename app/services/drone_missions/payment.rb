module DroneMissions
  # A paid Checkout Session of a drone mission (metadata drone_mission_id),
  # from the webhook or when the client comes back from Stripe; recording it
  # twice is harmless.
  module Payment
    PAID = %w[paid no_payment_required].freeze

    module_function

    def call(session, paid_at: Time.current)
      return "session not paid" unless PAID.include?(session["payment_status"])
      mission = DroneMission.find_by(id: session.dig("metadata", "drone_mission_id"))
      return "unknown drone mission" unless mission
      return "drone mission already paid" if mission.stripe_checkout_session_id == session["id"]

      recorded = mission.record_payment!(
        session_id: session["id"], payment_intent_id: Billing::Payload.id_of(session["payment_intent"]),
        paid_at:, livemode: session.fetch("livemode", true)
      )
      recorded ? "drone mission paid" : "drone mission not awaiting payment"
    end
  end
end
