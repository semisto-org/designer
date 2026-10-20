# A drone mission booked in the directory: a gardener (client) asks a pilot
# to fly over one of their maps, the pilot accepts (with a planned day) or
# declines, the client pays in Terranova, the pilot flies and delivers the
# data on the map, and the pilot is paid once the client confirms, or
# CONFIRMATION_DELAY after delivery if the client says nothing.
#
#   requested → accepted → paid → delivered → completed (paid out)
#   requested → declined;  requested | accepted → cancelled
#   paid | delivered → refunded (by Semisto)
#
# A delivered mission the client disputes waits for Semisto, who pays the
# pilot or refunds the client. The amounts are frozen when the mission is
# requested (Quote): the pilot's flat price, the travel fees and Semisto's
# share: COMMISSION_RATE of the flat price before VAT (never of the travel
# fees), plus Belgian VAT on it for a Belgian pilot. A pilot elsewhere in the
# EU accounts for that VAT themselves (reverse charge). Michael, 2026-10-20.
#
# From the request until the mission is closed, the pilot reads the map
# (Map#role_for) and, once it is paid, imports drone views, photos and files
# on it (deliverable_by?).
class DroneMission < ApplicationRecord
  STATUSES = %w[requested accepted declined cancelled paid delivered completed refunded].freeze
  OPEN_STATUSES = %w[requested accepted paid delivered].freeze
  COMMISSION_RATE = 0.20
  # VAT Semisto charges on its commission, by the pilot's country.
  COMMISSION_VAT_RATES = { "BE" => 0.21 }.freeze
  CONFIRMATION_DELAY = 7.days
  # How many missions a client can have waiting for a pilot's answer.
  MAX_WAITING = 5

  Quote = Data.define(:price_cents, :travel_km, :travel_cents, :commission_cents, :commission_vat_cents) do
    def self.for(pilot, map)
      km = pilot.travel_km_to(map)
      commission = commission_for(pilot)
      new(price_cents: pilot.mission_price_cents, travel_km: km, travel_cents: km * DronePilot::TRAVEL_CENTS_PER_KM, **commission)
    end

    # Semisto's share of a pilot's flat price, before VAT and its VAT.
    def self.commission_for(pilot, price_cents = pilot.mission_price_cents)
      commission = (price_cents / (1 + pilot.vat_rate) * COMMISSION_RATE).round
      { commission_cents: commission, commission_vat_cents: (commission * COMMISSION_VAT_RATES.fetch(pilot.country, 0)).round }
    end

    def total_cents = price_cents + travel_cents
    def semisto_cents = commission_cents + commission_vat_cents
    def pilot_share_cents = total_cents - semisto_cents

    def as_json(*)
      { priceCents: price_cents, travelKm: travel_km, travelCents: travel_cents, commissionCents: commission_cents,
        commissionVatCents: commission_vat_cents, semistoCents: semisto_cents, totalCents: total_cents, pilotShareCents: pilot_share_cents }
    end
  end

  belongs_to :map
  belongs_to :client, class_name: "User"
  belongs_to :drone_pilot
  has_many :aerial_views, dependent: :nullify
  has_many :photos, class_name: "MapPhoto", dependent: :nullify
  # Point clouds, 3D models, reports… what does not go on the map itself.
  has_many_attached :files

  normalizes :message, :pilot_reply, :delivery_note, :dispute_message, with: ->(text) { text.to_s.strip.presence }
  normalizes :desired_period, with: ->(text) { text.to_s.squish.presence }

  validates :status, inclusion: { in: STATUSES }
  validates :message, presence: true, length: { maximum: 3000 }
  validates :desired_period, length: { maximum: 120 }
  validates :pilot_reply, :delivery_note, :dispute_message, length: { maximum: 3000 }
  validates :price_cents, :commission_cents, numericality: { only_integer: true, greater_than: 0 }
  validates :travel_km, :travel_cents, :commission_vat_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validate :data_types_offered
  validate :client_edits_map, :pilot_bookable, :map_located, :pilot_serves_map, :not_own_pilot, :not_too_many_waiting, on: :create

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }
  scope :open, -> { where(status: OPEN_STATUSES) }
  scope :for_pilot_user, ->(user) { where(drone_pilot_id: DronePilot.where(user:).select(:id)) }
  scope :payout_due, ->(now = Time.current) {
    where(status: "delivered", disputed_at: nil, paid_out_at: nil).where(delivered_at: ...(now - CONFIRMATION_DELAY))
  }

  after_create_commit -> { DroneMissionMailer.with(mission: self).requested.deliver_later }

  def self.request!(client:, pilot:, map:, **attrs)
    quote = pilot.quote_for(map)
    create!(attrs.merge(client:, drone_pilot: pilot, map:, price_cents: quote.price_cents, travel_km: quote.travel_km,
      travel_cents: quote.travel_cents, commission_cents: quote.commission_cents, commission_vat_cents: quote.commission_vat_cents))
  end

  STATUSES.each { |name| define_method(:"#{name}?") { status == name } }

  def quote = Quote.new(price_cents:, travel_km:, travel_cents:, commission_cents:, commission_vat_cents:)
  def total_cents = quote.total_cents
  def pilot_share_cents = quote.pilot_share_cents
  def open? = OPEN_STATUSES.include?(status)
  def disputed? = disputed_at.present? && delivered?
  def transfer_group = "drone_mission_#{id}"

  def pilot_user?(user) = user.present? && drone_pilot.user_id == user.id
  def client?(user) = user.present? && client_id == user.id

  # The pilot reads the map while the mission is open.
  def map_readable_by?(user) = open? && pilot_user?(user)

  # Once paid, the pilot puts the data on the map until the mission is closed.
  def deliverable_by?(user) = (paid? || delivered?) && pilot_user?(user)

  def payout_due?(now = Time.current) = delivered? && !disputed? && paid_out_at.nil? && delivered_at <= now - CONFIRMATION_DELAY

  def accept!(flight_on:, reply: nil)
    transition!("requested", "accepted", flight_on:, pilot_reply: reply, accepted_at: Time.current)
    DroneMissionMailer.with(mission: self).accepted.deliver_later
  end

  def decline!(reply:)
    transition!("requested", "declined", pilot_reply: reply, closed_at: Time.current)
    DroneMissionMailer.with(mission: self).declined.deliver_later
  end

  # The client changes their mind before paying.
  def cancel!
    raise InvalidTransition unless requested? || accepted?
    update!(status: "cancelled", closed_at: Time.current)
    DroneMissionMailer.with(mission: self).cancelled.deliver_later
  end

  # Recorded once Stripe says the Checkout Session is paid (webhook or return).
  def record_payment!(session_id:, payment_intent_id:, paid_at:, livemode:)
    with_lock do
      return false if paid_at? || !accepted?
      update!(status: "paid", paid_at:, livemode:, stripe_checkout_session_id: session_id, stripe_payment_intent_id: payment_intent_id)
    end
    DroneMissionMailer.with(mission: self).paid.deliver_later
    true
  end

  def deliver!(note: nil)
    transition!("paid", "delivered", delivery_note: note, delivered_at: Time.current)
    DroneMissionMailer.with(mission: self).delivered.deliver_later
  end

  # The client is happy: the pilot is paid now.
  def confirm!
    raise InvalidTransition unless delivered? && paid_out_at.nil?
    update!(disputed_at: nil) if disputed_at
    DroneMissions::Payout.call(self)
  end

  def dispute!(message:)
    raise InvalidTransition unless delivered? && paid_out_at.nil?
    update!(disputed_at: Time.current, dispute_message: message)
    DroneMissionMailer.with(mission: self).disputed.deliver_later
  end

  def mark_paid_out!(transfer_id:)
    update!(status: "completed", stripe_transfer_id: transfer_id, paid_out_at: Time.current, payout_error: nil, closed_at: Time.current)
    DroneMissionMailer.with(mission: self).paid_out.deliver_later
  end

  def mark_refunded!
    update!(status: "refunded", closed_at: Time.current)
    DroneMissionMailer.with(mission: self).refunded.deliver_later
  end

  # Missions delivered more than CONFIRMATION_DELAY ago, undisputed: the pilot is paid.
  def self.release_due_payouts!(now = Time.current)
    payout_due(now).find_each do |mission|
      DroneMissions::Payout.call(mission)
    rescue StandardError => e
      Rails.error.report(e, handled: true, context: { drone_mission_id: mission.id })
    end
  end

  class InvalidTransition < StandardError; end

  private
    def transition!(from, to, **attrs)
      raise InvalidTransition, "#{status} → #{to}" unless status == from
      update!(attrs.merge(status: to))
    end

    def data_types_offered
      types = Array(data_types)
      return errors.add(:data_types, :blank) if types.empty?
      offered = Array(drone_pilot&.data_types)
      errors.add(:data_types, :not_offered) unless (types - offered).empty?
    end

    def client_edits_map
      errors.add(:map, :not_editable) if map && client && !map.editable_by?(client)
    end

    def pilot_bookable
      errors.add(:drone_pilot, :not_listed) unless drone_pilot&.listed?
    end

    def map_located
      errors.add(:map, :not_located) if map && map.center.nil?
    end

    def pilot_serves_map
      return if map.nil? || drone_pilot.nil? || map.center.nil?
      if !drone_pilot.same_country?(map) then errors.add(:map, :other_country)
      elsif !drone_pilot.serves?(map) then errors.add(:map, :out_of_range)
      end
    end

    def not_own_pilot
      errors.add(:drone_pilot, :yourself) if drone_pilot && client_id == drone_pilot.user_id
    end

    def not_too_many_waiting
      errors.add(:base, :too_many) if client && DroneMission.where(client:, status: "requested").count >= MAX_WAITING
    end
end
