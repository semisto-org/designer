# A map's « Présenter » sequence: ordered steps, each a view of the map that
# a click brings back (framing, open panel, hidden layers, kinds and strata,
# the version shown, the sector groups kept around the terrain, the moment
# of the time strip and its noon shade, a selected element) with the
# presenter's own note. The editor captures views; a template
# (PresentationTemplate) gives a first sequence with default views.
#
# `steps` is one jsonb array, cleaned on every write: unknown keys go, sizes
# are bounded, so the editor can save it whole.
class MapPresentation < ApplicationRecord
  MAX_STEPS = 60
  MOMENTS = %w[arrival today year5 year15 year30].freeze
  SHADES = %w[june december].freeze
  SECTOR_GROUPS = %w[sun wind risks nuisances views wildlife other].freeze
  STRATA = (PlantVocabulary::STRATA + %w[unknown]).freeze

  belongs_to :map, touch: true

  validates :name, presence: true, length: { maximum: 120 }
  validate :steps_within_limit

  before_validation { self.steps = self.class.clean_steps(steps) }

  scope :ordered, -> { order(:id) }

  def self.clean_steps(steps)
    Array(steps).filter_map { |step| clean_step(step) }
  end

  def self.clean_step(step)
    step = step.to_h.stringify_keys rescue (return nil)
    title = step["title"].to_s.squish.first(120)
    return nil if title.blank?
    {
      "id" => step["id"].to_s.presence&.first(40) || SecureRandom.uuid,
      "key" => step["key"].to_s.presence&.first(40),
      "title" => title,
      "note" => step["note"].to_s.strip.first(4_000).presence,
      "shown" => step.key?("shown") ? ActiveModel::Type::Boolean.new.cast(step["shown"]) != false : true,
      "captured" => ActiveModel::Type::Boolean.new.cast(step["captured"]) == true,
      "view" => clean_view(step["view"])
    }.compact
  end

  def self.clean_view(view)
    view = view.to_h.stringify_keys rescue (return {})
    {
      "camera" => clean_camera(view["camera"]),
      "panel" => view["panel"].to_s.presence&.first(40),
      "hiddenLayers" => strings(view["hiddenLayers"]) & MapFeature::LAYERS,
      "hiddenKinds" => strings(view["hiddenKinds"]),
      "hiddenStrata" => strings(view["hiddenStrata"]) & STRATA,
      "version" => view["version"].to_s.presence&.first(80),
      "sectors" => view["sectors"].nil? ? nil : strings(view["sectors"]) & SECTOR_GROUPS,
      "moment" => view["moment"].presence_in(MOMENTS),
      "shade" => view["shade"].presence_in(SHADES),
      "featureId" => Integer(view["featureId"], exception: false)
    }.compact
  end

  def self.clean_camera(camera)
    camera = camera.to_h.stringify_keys rescue (return nil)
    lng, lat = Array(camera["center"]).map { Float(_1, exception: false) }
    return nil unless lng && lat && lng.between?(-180, 180) && lat.between?(-90, 90)
    {
      "center" => [ lng.round(7), lat.round(7) ],
      "zoom" => Float(camera["zoom"], exception: false)&.clamp(0, 24)&.round(2) || 17,
      "bearing" => Float(camera["bearing"], exception: false)&.clamp(-180, 180)&.round(1) || 0,
      "pitch" => Float(camera["pitch"], exception: false)&.clamp(0, 85)&.round(1) || 0
    }
  end

  def self.strings(value)
    Array(value).map { _1.to_s.first(60) }.reject(&:blank?).uniq.first(40)
  end

  def as_json(*)
    { id:, name:, templateKey: template_key, steps:, lockVersion: lock_version, updatedAt: updated_at&.iso8601 }
  end

  private
    def steps_within_limit
      errors.add(:steps, :too_many, message: I18n.t("presentations.errors.too_many", count: MAX_STEPS)) if steps.size > MAX_STEPS
    end
end
