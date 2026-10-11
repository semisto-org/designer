# The offer of a team map: Semisto's (or any team's) quote to design and
# plant the place, priced from what is drawn on the map, the project sheet
# and the team's internal sheet (Offer::Measures), with the team's own
# corrections (Offer::Inputs), computed by Offer::Estimator. One working
# offer per map; each « Enregistrer la version » freezes a copy (V1, V2…)
# the team can send, mark accepted, or start again from.
#
# Only for maps that belong to a team, and only for its members: the
# client never sees the internal sheet nor the computed lines.
class Offer < ApplicationRecord
  belongs_to :map
  belongs_to :updated_by, class_name: "User", optional: true
  has_many :versions, -> { order(:number) }, class_name: "OfferVersion", dependent: :destroy, inverse_of: :offer

  validates :map_id, uniqueness: true

  # A new offer, prefilled from the map: one scope line per drawn surface
  # or hedge that looks like planting, default trips per phase, and the
  # adjustments the project sheet points to.
  def self.build_for(map)
    offer = new(map:)
    measures = Measures.new(map, Inputs.normalize({}))
    scope = measures.candidates.filter_map do |feature|
      type = Catalog::DEFAULT_TYPE_BY_KIND[feature["kind"]]
      next unless type && feature["layer"] != "existing" && Catalog::PLANTING_TYPES.dig(type, :measure) == feature["measure_kind"]
      { "feature_id" => feature["id"], "planting_type" => type }
    end
    trips = Catalog::DEFAULT_TRIPS.map { |phase, count| { "phase" => phase, "trips" => count } }
    adjustments = measures.adjustment_hints.keys.map { { "preset" => _1 } }
    offer.inputs = { "scope" => scope, "trips" => trips, "adjustments" => adjustments }
    offer
  end

  def inputs=(value)
    @measures = @result = nil
    super(Inputs.normalize(value))
  end

  def measures = @measures ||= Measures.new(map, inputs)
  def result = @result ||= Estimator.new(inputs, measures).call

  def reload(*)
    @measures = @result = nil
    super
  end

  def next_version_number = (versions.maximum(:number) || 0) + 1

  # Freezes the offer as it stands into a new version.
  def save_version!(user:, note: nil)
    versions.create!(number: next_version_number, note:, inputs:, measures: measures.to_h, result:, created_by: user)
  end

  # Starts again from a saved version: its inputs become the working offer
  # (the map's measures are read live again).
  def restore!(version, user:)
    update!(inputs: version.inputs, updated_by: user)
  end
end
