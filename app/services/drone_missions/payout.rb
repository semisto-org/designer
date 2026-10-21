module DroneMissions
  # Sends the pilot their share of a delivered mission (the whole payment
  # minus Semisto's commission) to their connected Stripe account, tied to
  # the client's charge. A failure is kept on the mission for Semisto to see
  # and retry; the idempotency key makes a retry harmless.
  module Payout
    module_function

    def call(mission, gateway: nil)
      return "already paid out" if mission.paid_out_at
      raise DroneMission::InvalidTransition, mission.status unless mission.delivered?

      gateway ||= Providers::StripeGateway.new
      account = mission.drone_pilot.stripe_account_id or return fail!(mission, "no_account")
      transfer = gateway.create_transfer({
        amount: mission.pilot_share_cents, currency: mission.currency, destination: account,
        transfer_group: mission.transfer_group, source_transaction: charge_id(mission, gateway),
        description: I18n.t("drone_missions.checkout.description", id: mission.id, pilot: mission.drone_pilot.display_name),
        metadata: { drone_mission_id: mission.id.to_s }
      }.compact, idempotency_key: "drone-mission-#{mission.id}-payout")
      mission.mark_paid_out!(transfer_id: transfer.fetch("id"))
      "paid out"
    rescue Providers::StripeGateway::Error => e
      Rails.error.report(e, handled: true, context: { drone_mission_id: mission.id })
      fail!(mission, e.message)
    end

    # The transfer is tied to the charge, so it can leave before the payment
    # is available on Semisto's balance.
    def charge_id(mission, gateway)
      return mission.stripe_charge_id if mission.stripe_charge_id
      return nil unless mission.stripe_payment_intent_id
      charge = Billing::Payload.id_of(gateway.retrieve_payment_intent(mission.stripe_payment_intent_id)["latest_charge"])
      mission.update_column(:stripe_charge_id, charge) if charge
      charge
    end

    def fail!(mission, message)
      mission.update_column(:payout_error, message.to_s.first(500))
      "payout failed"
    end
  end
end
