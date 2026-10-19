# One phase of a map's implementation plan (« Mise en œuvre »): a name, the
# working season it covers (starts_on..ends_on) and the person's own
# figures. Elements of the map join it through `properties.phase_id`; the
# plan (Implementation::Plan) counts their workload and cost. `key` marks
# the phases of Semisto's proposal (Implementation::Proposal).
#
# An AI proposes phases as drafts (status « draft », source « ai », with its
# rationale and the elements it would put in them, proposed_feature_ids); a
# human accepts one (it becomes active and takes those elements) or refuses
# it (it goes).
class ImplementationPhase < ApplicationRecord
  MAX_PER_MAP = 20
  STATUSES = %w[active draft].freeze
  SOURCES = %w[human ai].freeze

  belongs_to :map, touch: true

  validates :name, presence: true, length: { maximum: 120 }
  validates :starts_on, :ends_on, presence: true
  validates :notes, :rationale, length: { maximum: 4_000 }
  validates :status, inclusion: { in: STATUSES }
  validates :source, inclusion: { in: SOURCES }
  validates :hours_override, numericality: { only_integer: true, in: 0..100_000 }, allow_nil: true
  validates :other_costs_cents, numericality: { only_integer: true, in: 0..100_000_000 }, allow_nil: true
  validate :ends_after_start
  validate :within_limit, on: :create

  scope :ordered, -> { order(:starts_on, :position, :id) }
  scope :active, -> { where(status: "active") }
  scope :drafts, -> { where(status: "draft") }

  before_create { self.position = (map.implementation_phases.maximum(:position) || -1) + 1 if position.zero? }

  # Feature ids leave the phase with it (their properties forget phase_id).
  before_destroy :release_features

  def draft? = status == "draft"

  # A draft becomes a phase of the plan and takes the elements it proposed
  # that are still on the map.
  def accept!(by: nil)
    ids = proposed_feature_ids.dup
    transaction do
      update!(status: "active", proposed_feature_ids: [])
      map.features.where(id: ids, status: "active").find_each do |feature|
        feature.update!(properties: feature.properties.merge("phase_id" => id), updated_by: by)
      end
    end
  end

  def months = (starts_on..ends_on).map { [ _1.year, _1.month ] }.uniq

  def weeks = ((ends_on - starts_on).to_i + 1) / 7.0

  private
    def ends_after_start
      errors.add(:ends_on, :after_start) if starts_on && ends_on && ends_on < starts_on
    end

    def within_limit
      errors.add(:base, :too_many) if map && map.implementation_phases.count >= MAX_PER_MAP
    end

    def release_features
      map.features.where("properties->>'phase_id' = ?", id.to_s).find_each do |feature|
        feature.update!(properties: feature.properties.except("phase_id"))
      end
    end
end
