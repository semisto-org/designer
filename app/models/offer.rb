# The offer of a map: a professional's or a team's quote to design and
# plant the place, priced from what is drawn on the map, the project sheet
# and the internal sheet (Offer::Measures), with the team's corrections
# (Offer::Inputs), by its pricing (Offer::Pricing: its template's, or
# Semisto's), computed by Offer::Estimator. One working offer per map; each
# « Enregistrer la version » freezes a copy (V1, V2…) to send, mark
# accepted, or start again from.
#
# Never for the client: on a team map, for its members; on any other map,
# for its owner with a professional plan (Offer.usable_by?).
class Offer < ApplicationRecord
  belongs_to :map
  belongs_to :offer_template, optional: true
  belongs_to :updated_by, class_name: "User", optional: true
  has_many :versions, -> { order(:number) }, class_name: "OfferVersion", dependent: :destroy, inverse_of: :offer

  validates :map_id, uniqueness: true
  validate :template_of_the_account

  # Whether the builder shows at all: on a team map for its members, and on
  # their own map for professional accounts (with or without the plan, which
  # usable_by? then checks). A personal account never sees it on its own
  # maps: the account kind decides what is shown, the plan what is allowed.
  def self.shown_to?(map, user)
    return false unless user
    return map.organization.member?(user) if map.organization
    map.owner_id == user.id && user.professional?
  end

  def self.usable_by?(map, user)
    return false unless user
    return map.organization.member?(user) if map.organization
    map.owner_id == user.id && user.professional? && Entitlements.for(user).offers?
  end

  # A new offer, prefilled from the map: the template for the client's
  # profile, one scope line per drawn surface or hedge that looks like
  # planting, default trips per phase, and the adjustments the project
  # sheet points to.
  def self.build_for(map)
    offer = new(map:)
    profile = map.project_sheet.section("who")["profile"].presence
    offer.offer_template = OfferTemplate.pick(OfferTemplate.account_for(map), profile)
    pricing = offer.pricing
    measures = Measures.new(map, Inputs.normalize({}, pricing), pricing)
    scope = measures.candidates.filter_map do |feature|
      type = pricing.default_type_for(feature["kind"], feature["measure_kind"])
      next unless type && feature["layer"] != "existing"
      { "feature_id" => feature["id"], "planting_type" => type }
    end
    trips = pricing.default_trips.filter_map { |phase, count| { "phase" => phase, "trips" => count } if count.positive? }
    adjustments = measures.adjustment_hints.keys.map { { "preset" => _1 } }
    offer.inputs = { "scope" => scope, "trips" => trips, "adjustments" => adjustments }
    offer
  end

  def pricing = offer_template&.pricing || Pricing.semisto
  def pricing_name = offer_template&.name

  def inputs=(value)
    @measures = @result = nil
    super(Inputs.normalize(value, pricing))
  end

  # Another pricing: rates start again from it (the team keeps its number
  # of designers), everything else the team did stays.
  def offer_template=(template)
    super
    return if new_record? && inputs.blank?
    kept = inputs.to_h
    designers = kept.dig("settings", "designers")
    self.inputs = kept.merge("settings" => { "designers" => designers })
  end

  def measures = @measures ||= Measures.new(map, inputs, pricing)
  def result = @result ||= Estimator.new(inputs, measures, pricing).call

  def reload(*)
    @measures = @result = nil
    super
  end

  def next_version_number = (versions.maximum(:number) || 0) + 1

  # Freezes the offer as it stands into a new version.
  def save_version!(user:, note: nil)
    versions.create!(number: next_version_number, note:, inputs:, measures: measures.to_h, result:,
                     pricing: pricing.to_h, pricing_name:, created_by: user)
  end

  # Starts again from a saved version: its inputs become the working offer
  # (the map's measures are read live again, with today's pricing).
  def restore!(version, user:)
    update!(inputs: version.inputs, updated_by: user)
  end

  private
    def template_of_the_account
      return unless offer_template && map
      errors.add(:offer_template, :invalid) unless offer_template.owner == OfferTemplate.account_for(map)
    end
end
