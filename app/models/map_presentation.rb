# A map's « Présenter » sequence: ordered steps, each a view of the map that
# a click brings back (framing, open panel, hidden layers, kinds and strata,
# the tag and the project variant shown, the sector groups kept around the terrain, the moment
# of the time strip, « Existant » or « Projet » and its noon shade, a selected element) with the
# presenter's own note. The editor captures views; a template
# (PresentationTemplate) gives a first sequence with default views.
#
# A step can also be a text slide (`slide.body`, « raison d'être »,
# « défis et atouts »…): its title and text are shown large over its view of
# the place. An AI drafts slides through the MCP (propose_slides!): the
# draft waits in `proposal` until an editor accepts or refuses it. Notes and
# drafts are the editors' own: viewers get the steps without them (for_viewer).
#
# `steps` is one jsonb array, cleaned on every write: unknown keys go, sizes
# are bounded, so the editor can save it whole.
class MapPresentation < ApplicationRecord
  MAX_STEPS = 60
  MAX_BODY = 4_000
  MOMENTS = %w[arrival today year5 year15 year30].freeze
  SHADES = %w[june december].freeze
  # « Existant » or « Projet » (app/frontend/map/time/mode.ts).
  MODES = %w[existing project].freeze
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
      "slide" => clean_slide(step["slide"]),
      "proposal" => clean_proposal(step["proposal"]),
      "view" => clean_view(step["view"])
    }.compact.tap { |clean| clean["view"].delete("relief") if clean["slide"] }
  end

  # A text slide: what the audience reads (nil for a view of the map).
  def self.clean_slide(slide)
    return nil if slide.nil?
    slide = slide.to_h.stringify_keys rescue (return nil)
    { "body" => slide["body"].to_s.strip.first(MAX_BODY) }
  end

  # A slide drafted by an AI, waiting for an editor: the text it would show,
  # its reason, and whether the step itself is new (refused, it goes).
  def self.clean_proposal(proposal)
    return nil if proposal.nil?
    proposal = proposal.to_h.stringify_keys rescue (return nil)
    body = proposal["body"].to_s.strip.first(MAX_BODY)
    return nil if body.blank?
    {
      "title" => proposal["title"].to_s.squish.first(120).presence,
      "body" => body,
      "rationale" => proposal["rationale"].to_s.strip.first(2_000).presence,
      "new" => ActiveModel::Type::Boolean.new.cast(proposal["new"]) == true,
      "by" => proposal["by"].to_s.first(80).presence,
      "at" => proposal["at"].to_s.first(40).presence
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
      # One tag shown on its own; « version » is its name before the project variants.
      "tag" => (view["tag"] || view["version"]).to_s.presence&.first(80),
      "variantId" => Integer(view["variantId"], exception: false),
      "sectors" => view["sectors"].nil? ? nil : strings(view["sectors"]) & SECTOR_GROUPS,
      "moment" => view["moment"].presence_in(MOMENTS),
      "mode" => view["mode"].presence_in(MODES),
      "shade" => view["shade"].presence_in(SHADES),
      "featureId" => Integer(view["featureId"], exception: false),
      "relief" => clean_relief(view["relief"])
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

  RELIEF_TABS = %w[view rain sun night].freeze
  RELIEF_BASES = %w[ortho altitude canopy aspect wetness frost landcover blocks].freeze
  SUN_MODES = %w[off instant day].freeze
  SUN_DATES = %w[winter equinox summer today].freeze

  # A view of the 3D relief: camera position and target in scene metres,
  # ground, tab, sun and the plants' year. nil when the step has none.
  def self.clean_relief(relief)
    return nil if relief.nil?
    relief = relief.to_h.stringify_keys rescue (return nil)
    vector = ->(value) do
      numbers = Array(value).map { Float(_1, exception: false) }
      numbers.size == 3 && numbers.all? { _1&.finite? && _1.abs < 1_000_000 } ? numbers.map { _1.round(2) } : nil
    end
    sun = relief["sun"].to_h.stringify_keys rescue {}
    {
      "position" => vector.(relief["position"]),
      "target" => vector.(relief["target"]),
      "base" => relief["base"].presence_in(RELIEF_BASES),
      "exaggeration" => Float(relief["exaggeration"], exception: false)&.clamp(0.5, 10)&.round(2),
      "tab" => relief["tab"].presence_in(RELIEF_TABS),
      "sun" => sun["mode"].presence_in(SUN_MODES) && sun["date"].presence_in(SUN_DATES) ? {
        "mode" => sun["mode"], "date" => sun["date"], "minutes" => Integer(sun["minutes"], exception: false)&.clamp(0, 1439) || 720
      } : nil,
      "year" => Integer(relief["year"], exception: false)&.clamp(0, 100)
    }.compact.presence
  end

  def self.strings(value)
    Array(value).map { _1.to_s.first(60) }.reject(&:blank?).uniq.first(40)
  end

  def as_json(*)
    { id:, name:, templateKey: template_key, steps:, lockVersion: lock_version, updatedAt: updated_at&.iso8601 }
  end

  # What a viewer of the map (the client) follows: the steps without the
  # presenter's notes and without the drafts nobody accepted yet.
  def for_viewer
    as_json.merge(steps: steps.reject { _1.dig("proposal", "new") }.map { _1.except("note", "proposal") })
  end

  Draft = Struct.new(:index, :step_id, :title, :body, :rationale, :after, keyword_init: true)

  # Slides an AI proposes: each fills an existing slide (step_id) or comes as
  # a new step after another one (after_step_id; absent: at the end), as a
  # draft an editor accepts or refuses in the panel. Returns what was placed
  # and what was refused, with the reason.
  def propose_slides!(drafts, by:)
    placed = []
    refused = []
    with_lock do
      list = steps.map(&:dup)
      drafts.each do |draft|
        proposal = { "title" => draft.title, "body" => draft.body, "rationale" => draft.rationale, "by" => by, "at" => Time.current.iso8601 }
        if draft.step_id.present?
          step = list.find { _1["id"] == draft.step_id }
          next refused << { index: draft.index, error: I18n.t("mcp.presentation_errors.unknown_step", id: draft.step_id) } unless step
          next refused << { index: draft.index, error: I18n.t("mcp.presentation_errors.not_a_slide", title: step["title"]) } unless step["slide"]
          step["proposal"] = proposal
          placed << { index: draft.index, step_id: step["id"], title: draft.title || step["title"], replaces: step.dig("slide", "body").present? }
        else
          if list.size >= MAX_STEPS
            next refused << { index: draft.index, error: I18n.t("presentations.errors.too_many", count: MAX_STEPS) }
          end
          at = draft.after.present? ? list.index { _1["id"] == draft.after } : list.size - 1
          next refused << { index: draft.index, error: I18n.t("mcp.presentation_errors.unknown_step", id: draft.after) } if at.nil?
          title = draft.title.presence || I18n.t("presentations.new_slide_title")
          step = { "id" => SecureRandom.uuid, "title" => title, "shown" => false, "slide" => { "body" => "" },
                   "proposal" => proposal.merge("new" => true), "view" => list[at]&.dig("view") || {} }
          list.insert(at + 1, step)
          placed << { index: draft.index, step_id: step["id"], title:, new: true }
        end
      end
      update!(steps: list) if placed.any?
    end
    [ placed, refused ]
  end

  private
    def steps_within_limit
      errors.add(:steps, :too_many, message: I18n.t("presentations.errors.too_many", count: MAX_STEPS)) if steps.size > MAX_STEPS
    end
end
