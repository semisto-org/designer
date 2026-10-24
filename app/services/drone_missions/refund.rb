module DroneMissions
  # Semisto gives a paid mission's money back to the client (the pilot could
  # not fly, or a dispute went the client's way), before the pilot is paid.
  module Refund
    module_function

    def call(mission, gateway: nil)
      raise DroneMission::InvalidTransition, mission.status unless (mission.paid? || mission.delivered?) && mission.paid_out_at.nil?
      gateway ||= Providers::StripeGateway.new
      gateway.create_refund({ payment_intent: mission.stripe_payment_intent_id, metadata: { drone_mission_id: mission.id.to_s } },
        idempotency_key: "drone-mission-#{mission.id}-refund")
      mission.mark_refunded!
    end
  end
end
