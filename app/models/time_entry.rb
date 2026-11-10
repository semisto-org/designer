# « Temps et dépenses »: hours a designer worked on a project (a map), in
# a phase of the offer, with the trip that went with them. Two states only
# (Michael, 2026-11-10): « Noté », then « Facturé » once the designer puts
# it on their own invoice (invoiced_at + invoice_number); an invoiced entry
# is locked until its author takes the invoicing back.
#
# Non-billable hours carry a reason: offered, travel or other. Never
# « bénévolat »: a freelancer's unpaid work for the structure that pays
# them is a legal risk in Belgium. An overrun is not a reason either: it is
# computed against the phase's envelope (TimeEntry::Envelopes).
#
# Who may log time on a map: its owner and editors (a team's members are
# editors of its maps), when the map's plan includes the offer builder (Pro
# and Team). Viewers, often the client, never read entries.
class TimeEntry < ApplicationRecord
  # « commercial »: before the offer is accepted (visit, building the offer);
  # the other three are the offer's phases (Offer::Pricing::PHASES).
  PHASES = [ "commercial", *Offer::Pricing::PHASES ].freeze
  NON_BILLABLE_REASONS = %w[offered travel other].freeze
  SOURCES = %w[web mcp app].freeze
  MAX_MINUTES = 24 * 60
  STEP_MINUTES = 15
  MAX_TRIP_KM = 5_000

  belongs_to :map
  belongs_to :user

  normalizes :note, :bill_to, :trip_from, :trip_to, :invoice_number, with: ->(value) { value.to_s.strip.presence }

  validates :worked_on, presence: true
  validates :minutes, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_MINUTES }
  validate :minutes_in_steps
  validates :phase, inclusion: { in: PHASES }
  validates :non_billable_reason, inclusion: { in: NON_BILLABLE_REASONS }, unless: :billable?
  validates :note, length: { maximum: 1_000 }
  validates :bill_to, :trip_from, :trip_to, length: { maximum: 120 }
  validates :invoice_number, length: { maximum: 60 }
  validates :trip_km, numericality: { greater_than: 0, less_than_or_equal_to: MAX_TRIP_KM }, allow_nil: true
  validates :source, inclusion: { in: SOURCES }
  validate :worked_on_not_far_ahead

  before_validation { self.non_billable_reason = nil if billable? }

  scope :invoiced, -> { where.not(invoiced_at: nil) }
  scope :not_invoiced, -> { where(invoiced_at: nil) }
  scope :billable, -> { where(billable: true) }
  scope :to_invoice, -> { billable.not_invoiced }
  scope :chronological, -> { order(:worked_on, :id) }

  # The map takes time entries at all: Pro and Team plans (everything while
  # billing is off, the beta).
  def self.enabled_for?(map) = Entitlements.for_map(map).offers?

  # Whether the person sees « Temps et dépenses » on this map (or its plan
  # upsell): its team, or editors of a professional's map. A personal
  # account on its own map never sees it, like the offer builder.
  def self.shown_to?(map, user)
    return false unless user && %w[owner editor].include?(map.role_for(user))
    map.organization.present? || map.owner.professional? || user.professional?
  end

  def self.usable_by?(map, user) = shown_to?(map, user) && enabled_for?(map)

  # Whether the « Temps et dépenses » tab shows: for the team (or its
  # upsell), and for the client once the team shows them the project.
  def self.tab_for?(map, user) = shown_to?(map, user) || ProjectExpense.client_view?(map, user)

  # The maps where this person may log time now, most recently used first.
  def self.maps_for(user)
    maps = Map.active.where(owner_id: user.id)
              .or(Map.active.where(id: user.map_memberships.where(role: %w[owner editor]).select(:map_id)))
              .or(Map.active.where(organization_id: user.organization_memberships.select(:organization_id)))
              .includes(:owner, :organization).to_a
    used = where(user:).group(:map_id).maximum(:updated_at)
    maps.select { usable_by?(_1, user) }.sort_by { |map| [ -(used[map.id]&.to_f || 0), map.name.downcase ] }
  end

  def invoiced? = invoiced_at.present?
  def hours = (minutes / 60.0).round(2)
  def status = invoiced? ? "invoiced" : "noted"

  # Who the designer bills by default on this map: what they wrote last
  # time here, else the map's team, else nothing to guess.
  def self.default_bill_to(map, user)
    where(map:, user:).where.not(bill_to: nil).order(:updated_at).last&.bill_to || map.organization&.name
  end

  # The person's usual trip to this place: the last one they noted here.
  def self.usual_trip(map, user)
    last = where(map:, user:).where.not(trip_km: nil).order(:updated_at).last
    last && { km: last.trip_km.to_f, from: last.trip_from, to: last.trip_to }
  end

  # The phase a new entry most likely belongs to: the person's last one
  # here, else « commercial » before an accepted offer, else pre-design.
  def self.default_phase(map, user)
    where(map:, user:).order(:updated_at).last&.phase ||
      (TimeEntry::Envelopes.accepted_version(map) ? "pre_design" : "commercial")
  end

  def as_json(*)
    {
      id:, mapId: map_id, userId: user_id, userName: user.display_name, workedOn: worked_on.iso8601,
      minutes:, phase:, billable:, nonBillableReason: non_billable_reason, note:, billTo: bill_to,
      tripKm: trip_km&.to_f, tripFrom: trip_from, tripTo: trip_to,
      status:, invoicedAt: invoiced_at&.iso8601, invoiceNumber: invoice_number, source:
    }
  end

  private
    def minutes_in_steps
      errors.add(:minutes, :steps, step: STEP_MINUTES) if minutes.is_a?(Integer) && (minutes % STEP_MINUTES).nonzero?
    end

    # A day or two ahead is a slip of the calendar; next month is not work done.
    def worked_on_not_far_ahead
      errors.add(:worked_on, :future) if worked_on && worked_on > Date.current + 7
    end
end
