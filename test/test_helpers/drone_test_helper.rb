# Builders for « Vues drone » tests: drone orders and aerial views.
module DroneTestHelper
  PMTILES_URL = "https://drone.example.org/ahinvaux-2027-05-12.pmtiles".freeze
  XYZ_URL = "https://tiles.example.org/ahinvaux/{z}/{x}/{y}.png".freeze

  def drone_order(user, paid_at: Time.current, status: "paid")
    user.plan_purchases.create!(plan_key: "drone", status:, starts_at: paid_at,
                                stripe_checkout_session_id: "cs_drone_#{SecureRandom.hex(4)}")
  end

  def aerial_view(map, **attributes)
    map.aerial_views.create!({ captured_on: Date.new(2027, 5, 12), kind: "pmtiles", url: PMTILES_URL }.merge(attributes))
  end
end
