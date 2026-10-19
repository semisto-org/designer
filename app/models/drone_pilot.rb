# A drone pilot of the directory (« Pilotes de drone »). Any user can apply;
# Semisto checks the application (operator number, certificate, insurance)
# and approves it in /admin/drone-pilots. An approved pilot is listed once
# they can be paid: their Stripe Connect account (Express) is ready to
# receive transfers, or always while billing is off (beta).
#
# The pilot sets one flat mission price (what the client pays, VAT included)
# and may add travel fees (TRAVEL_CENTS_PER_KM per km, there and back, from
# their base to the map). Semisto keeps COMMISSION_RATE of the flat price,
# never of the travel fees (DroneMission::Quote).
#
# The legal fields (legal form, name, address, numbers, birth date) are what
# a platform owes the tax authority once a year (DAC7) and are never shown
# to clients.
class DronePilot < ApplicationRecord
  STATUSES = %w[pending approved rejected suspended].freeze
  LEGAL_FORMS = %w[individual company].freeze
  COUNTRIES = %w[BE FR LU NL DE].freeze
  TRAVEL_CENTS_PER_KM = 50
  # Straight-line distance times this gives a fair road distance.
  ROAD_FACTOR = 1.3
  MIN_PRICE_CENTS = 50_00
  MAX_PRICE_CENTS = 20_000_00
  MAX_DRONES = 10

  belongs_to :user
  belongs_to :reviewed_by, class_name: "User", optional: true
  has_many :missions, class_name: "DroneMission", dependent: :restrict_with_error

  normalizes :display_name, :base_place, :operator_number, :insurer, :legal_name, :business_number, :vat_number, :tax_number, :phone,
    with: ->(value) { value.to_s.squish.presence }
  normalizes :bio, :address, :review_note, with: ->(value) { value.to_s.strip.presence }
  normalizes :operator_number, with: ->(value) { value.to_s.gsub(/\s/, "").upcase.presence }

  validates :status, inclusion: { in: STATUSES }
  validates :display_name, presence: true, length: { maximum: 80 }
  validates :bio, length: { maximum: 2000 }
  validates :base_place, presence: true, length: { maximum: 200 }
  validates :base_location, presence: true
  validates :service_radius_km, numericality: { only_integer: true, in: 5..1000 }
  validates :mission_price_cents, numericality: { only_integer: true, in: MIN_PRICE_CENTS..MAX_PRICE_CENTS }
  validates :operator_number, presence: true, format: { with: /\A[A-Z]{3}[A-Z0-9-]{8,20}\z/ }
  validates :insurer, presence: true, length: { maximum: 120 }
  validates :phone, length: { maximum: 40 }
  validates :legal_form, inclusion: { in: LEGAL_FORMS }
  validates :legal_name, presence: true, length: { maximum: 160 }
  validates :address, presence: true, length: { maximum: 500 }
  validates :country, inclusion: { in: COUNTRIES }
  validates :business_number, presence: true, length: { maximum: 40 }, if: -> { legal_form == "company" }
  validates :tax_number, presence: true, length: { maximum: 40 }, if: -> { legal_form == "individual" }
  validates :birth_date, presence: true, if: -> { legal_form == "individual" }
  validates :vat_number, length: { maximum: 40 }
  # A refusal or a suspension always says why.
  validates :review_note, presence: true, if: -> { %w[rejected suspended].include?(status) && will_save_change_to_status? }
  validate :drones_known
  validate :data_types_possible
  validate :certificates_known

  scope :approved, -> { where(status: "approved") }
  scope :pending, -> { where(status: "pending") }
  # In the directory: approved, and able to be paid when payments are on.
  scope :listed, -> { Billing.enabled? ? approved.where(payouts_enabled: true) : approved }

  after_create_commit -> { DronePilotMailer.with(pilot: self).applied.deliver_later }

  def approved? = status == "approved"
  def pending? = status == "pending"
  def listed? = approved? && (!Billing.enabled? || payouts_enabled?)
  # A client can book them now (listed, and Stripe can take the payment).
  def bookable? = listed? && Billing.enabled?

  def features = DroneCatalog.features_of(drones)

  def longitude = base_location&.x
  def latitude = base_location&.y

  def place_at!(lng, lat)
    self.base_location = lng.present? && lat.present? ? GeoJsonGeometry::FACTORY.point(lng.to_f, lat.to_f) : nil
  end

  # Straight-line kilometres from the pilot's base to a map's centre, or nil.
  def distance_km_to(map)
    center = map&.center
    return nil unless center && base_location
    rad = Math::PI / 180
    dlat = (center.y - latitude) * rad
    dlng = (center.x - longitude) * rad
    a = Math.sin(dlat / 2)**2 + Math.cos(latitude * rad) * Math.cos(center.y * rad) * Math.sin(dlng / 2)**2
    6371.0 * 2 * Math.asin(Math.sqrt(a))
  end

  def serves?(map)
    distance = distance_km_to(map)
    distance.present? && distance <= service_radius_km
  end

  # Kilometres billed for a mission on this map: there and back, by road.
  def travel_km_to(map)
    return 0 unless travel_fees_enabled?
    distance = distance_km_to(map) or return 0
    (distance * 2 * ROAD_FACTOR).ceil
  end

  def quote_for(map) = DroneMission::Quote.for(self, map)

  def approve!(by:)
    update!(status: "approved", reviewed_by: by, reviewed_at: Time.current, review_note: nil)
    DronePilotMailer.with(pilot: self).approved.deliver_later
  end

  def reject!(by:, note:)
    update!(status: "rejected", reviewed_by: by, reviewed_at: Time.current, review_note: note)
    DronePilotMailer.with(pilot: self).rejected.deliver_later
  end

  def suspend!(by:, note:)
    update!(status: "suspended", reviewed_by: by, reviewed_at: Time.current, review_note: note)
  end

  # A rejected application sent again goes back to Semisto.
  def resubmit!
    update!(status: "pending") if status == "rejected"
  end

  # Stripe's view of the connected account (account.updated or a lookup).
  def sync_stripe_account!(account)
    update!(
      payouts_enabled: account["payouts_enabled"] == true && account.dig("capabilities", "transfers") == "active" &&
        account.dig("capabilities", "card_payments") == "active",
      details_submitted: account["details_submitted"] == true
    )
  end

  private
    def drones_known
      list = Array(drones)
      return errors.add(:drones, :blank) if list.empty?
      return errors.add(:drones, :too_long, count: MAX_DRONES) if list.size > MAX_DRONES
      list.each do |drone|
        next errors.add(:drones, :invalid) unless drone.is_a?(Hash) && DroneCatalog::DRONES.key?(drone["model"].to_s)
        errors.add(:drones, :other_unnamed) if drone["model"] == "other" && drone["name"].to_s.strip.empty?
      end
    end

    def data_types_possible
      types = Array(data_types)
      return errors.add(:data_types, :blank) if types.empty?
      return errors.add(:data_types, :invalid) unless (types - DroneCatalog::DATA_TYPES).empty?
      missing = types - DroneCatalog.possible_data_types(drones)
      errors.add(:data_types, :not_with_drones, types: missing.map { I18n.t("drone_pilots.data_types.#{_1}.name") }.to_sentence) if missing.any?
    end

    def certificates_known
      list = Array(certificates)
      errors.add(:certificates, :blank) if list.empty?
      errors.add(:certificates, :invalid) unless (list - DroneCatalog::CERTIFICATES).empty?
    end
end
