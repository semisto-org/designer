# Where water comes from on a map (well, rain, forest catchment, mains…) and
# whether it is drinkable. Taps (MapFeature kind "tap") point to one through
# `properties.water_source_id` and carry its potability (MapFeature::WaterSourceLink).
class WaterSource < ApplicationRecord
  NAME_MAX = 80
  # Element kinds that can be linked to a source.
  LINKABLE_KINDS = %w[tap].freeze

  belongs_to :map, touch: true

  validates :name, presence: true, length: { maximum: NAME_MAX }
  validates :name, uniqueness: { scope: :map_id, case_sensitive: false }
  validates :potable, inclusion: { in: [ true, false ] }
  validates :notes, length: { maximum: 2000 }

  normalizes :name, with: ->(name) { name.squish }
  normalizes :notes, with: ->(notes) { notes.strip.presence }

  scope :ordered, -> { order(:position, :id) }

  before_create { self.position = (map.water_sources.maximum(:position) || -1) + 1 }
  after_update :sync_taps, if: :saved_change_to_potable?
  before_destroy :unlink_taps

  # The map's elements linked to this source.
  def taps
    map.features.where(kind: LINKABLE_KINDS).where("map_features.properties->>'water_source_id' = ?", id.to_s)
  end

  def as_json(*)
    { id:, name:, potable:, notes:, tapCount: taps.where.not(status: "rejected").count }
  end

  private
    # Each linked tap takes the source's potability (and is broadcast to the
    # open editors like any other change).
    def sync_taps
      taps.find_each { |tap| tap.update!(properties: tap.properties.merge("potable" => potable), updated_by: Current.user) }
    end

    # The taps stay, unlinked, with the potability they had.
    def unlink_taps
      taps.find_each { |tap| tap.update!(properties: tap.properties.except("water_source_id"), updated_by: Current.user) }
    end
end
