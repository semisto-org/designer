# Builds the pilots and missions of the drone pilot directory for tests: a
# pilot based in Namur (about 20 km from the Ahinvaux fixture map), approved
# unless told otherwise, flying a Mavic 3 Thermal.
module DronePilotsTestHelper
  NAMUR = [ 4.8670, 50.4669 ].freeze

  def create_pilot(user, **attrs)
    DronePilot.new({
      user:, status: "approved", display_name: "Pilote #{user.name}", base_place: "Namur",
      service_radius_km: 60, mission_price_cents: 350_00, travel_fees_enabled: true,
      drones: [ { "model" => "mavic_3_thermal" } ], data_types: %w[photos orthophoto thermal],
      certificates: %w[a1_a3 a2], operator_number: "BEL12a3b4c5d6e", insurer: "Ethias 123456",
      legal_form: "individual", legal_name: user.name, tax_number: "83.02.01-123.45", birth_date: Date.new(1983, 2, 1),
      address: "Rue de la Gare 1, 5000 Namur", country: "BE", stripe_account_id: "acct_#{user.name.downcase}", payouts_enabled: true
    }.merge(attrs)).tap { _1.place_at!(*NAMUR) }.tap(&:save!)
  end

  def request_mission(pilot:, client:, map:, **attrs)
    DroneMission.request!(client:, pilot:, map:, data_types: %w[orthophoto], message: "Un vol en février, feuilles tombées.", **attrs)
  end

  # A mission the client has paid, ready to be delivered.
  def paid_mission(pilot:, client:, map:)
    request_mission(pilot:, client:, map:).tap do |mission|
      mission.accept!(flight_on: Date.new(2027, 2, 15))
      mission.record_payment!(session_id: "cs_drone", payment_intent_id: "pi_drone", paid_at: Time.current, livemode: false)
    end
  end
end
