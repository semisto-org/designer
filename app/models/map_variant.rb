# A variant of a map's project (« Projet 1 », « Projet 2 »). What is still a
# project on the map belongs either to every variant (no variant) or to
# exactly one; what is on the ground belongs to none. One variant is
# retained: it is the project the palette, the quantities, the offer, the
# implementation plan, the 3D view and the public map count
# (`MapFeature.in_design`). The others stay on the map, to look at, print
# and present.
class MapVariant < ApplicationRecord
  MAX_PER_MAP = 10

  belongs_to :map, touch: true
  # Who started it: several designers sketch the same place, each in a
  # variant of their own (« Esquisse de Julie »), before a common one.
  belongs_to :created_by, class_name: "User", optional: true
  has_many :features, class_name: "MapFeature", foreign_key: :variant_id, inverse_of: :variant, dependent: :nullify

  validates :name, presence: true, length: { maximum: 60 }
  validates :notes, length: { maximum: 4_000 }
  validate :within_limit, on: :create

  scope :ordered, -> { order(:position, :id) }
  scope :retained, -> { where(retained: true) }

  before_create :place_last
  # The first variant of a map is the retained one: the project was retained before there were two.
  before_create { self.retained = true unless map.variants.retained.exists? }
  # Its own elements go to the map's trash with it (⌘Z-able for 30 days, as a deleted element).
  before_destroy :trash_features, prepend: true
  # A map that keeps variants always retains one.
  after_destroy :retain_another

  # Makes this variant the project counted everywhere.
  def retain!
    return if retained?
    transaction do
      map.variants.retained.where.not(id:).update_all(retained: false, updated_at: Time.current)
      update!(retained: true)
    end
  end

  # A new variant with a copy of this one's own elements (the common project
  # is shared already): the designer's way to try another idea.
  def duplicate!(name:, by: nil)
    transaction do
      copy = map.variants.create!(name:, notes:, created_by: by)
      features.where(status: "active").order(:id).find_each { |feature| self.class.copy_feature!(feature, into: copy, by:) }
      copy
    end
  end

  # A copy of one element in another variant, or in the common project
  # (`into` nil): an idea taken from a teammate's sketch into the shared
  # one, while their sketch keeps it.
  def self.copy_feature!(feature, into:, by: nil)
    feature.map.features.create!(
      layer: feature.layer, kind: feature.kind, name: feature.name, notes: feature.notes,
      geometry: feature.geometry, style: feature.style, tags: feature.tags, source: "human",
      properties: feature.properties.except("number", "phase_id"), variant: into,
      created_by: by, updated_by: by
    )
  end

  def as_json(*)
    { id:, name:, notes:, position:, retained: retained?, author: created_by&.display_name, authorId: created_by_id }
  end

  private
    def place_last
      self.position = (map.variants.unscope(:order).maximum(:position) || -1) + 1 if position.zero?
    end

    def within_limit
      errors.add(:base, :too_many, count: MAX_PER_MAP) if map && map.variants.count >= MAX_PER_MAP
    end

    def trash_features
      features.find_each { |feature| feature.trash! }
    end

    def retain_another
      return unless retained?
      map.variants.ordered.first&.update!(retained: true)
    end
end
