# The step-by-step journey of a map: observe → map → design → plant. For each
# step a checklist computed from the real state of the map (outline drawn,
# project sheet filled, existing elements surveyed, palette started, plants
# placed, request sent…), and the next best action.
#
# `map.stage` is what the person says ("I am at this step"); the checklists
# say what the map shows. Items the server cannot know (the layers panel was
# opened) are flags kept by the browser and passed in as `seen`.
#
# Items whose data lives in another area (palette, plant list) are read
# defensively and omitted when that area is absent.
class Journey
  STEPS = Map::STAGES
  MIN_EXISTING_ELEMENTS = 3
  PROJECT_THRESHOLD = 60
  DESIGN_LAYERS = %w[water access structures animals].freeze
  CLIENT_ITEMS = %w[layers_seen].freeze

  # `panel`: id of the editor panel where the person does it (the client
  # resolves aliases and hides the button when no such panel exists).
  Item = Struct.new(:key, :step, :done, :panel, :progress, :count, :target, :client, keyword_init: true) do
    def as_json(*)
      { key:, step:, done:, panel:, progress:, count:, target:, client: }.compact
    end
  end

  attr_reader :map, :seen

  def initialize(map, seen: [])
    @map = map
    @seen = Array(seen).flat_map { |s| s.to_s.split(",") }.map(&:strip) & CLIENT_ITEMS
  end

  def items
    @items ||= [
      project_item, layers_item,
      boundary_item, existing_item,
      palette_item, design_elements_item,
      plant_plan_item, plant_list_item, action_item
    ].compact
  end

  def steps
    STEPS.map do |step|
      step_items = items.select { |i| i.step == step }
      known = step_items.reject { |i| i.done.nil? }
      {
        key: step,
        current: step == map.stage,
        done: known.any? && known.all?(&:done),
        completed: known.count(&:done),
        total: known.size,
        items: step_items.map(&:as_json)
      }
    end
  end

  # The one thing to do now: the first open item of the current step; when
  # the step is complete, move to the next one; after the last, we are done.
  def next_action
    current = items.select { |i| i.step == map.stage && i.done == false }.first
    return { type: "item", step: current.step, item: current.key, panel: current.panel } if current
    following = STEPS[STEPS.index(map.stage) + 1]
    following ? { type: "advance", stage: following } : { type: "complete" }
  end

  def as_json(*)
    { stage: map.stage, stageIndex: STEPS.index(map.stage), steps:, next: next_action }
  end

  private
    def project_item
      percent = map.project_sheet.progress[:percent]
      Item.new(key: "project_sheet", step: "observe", done: percent >= PROJECT_THRESHOLD, panel: "project", progress: percent, target: PROJECT_THRESHOLD)
    end

    def layers_item
      Item.new(key: "layers_seen", step: "observe", done: seen.include?("layers_seen"), panel: "layers", client: true)
    end

    def boundary_item
      Item.new(key: "boundary", step: "map", done: map.boundary.present?, panel: "terrain")
    end

    def existing_item
      count = features.where(layer: "existing").count
      Item.new(key: "existing", step: "map", done: count >= MIN_EXISTING_ELEMENTS, panel: "elements", count:, target: MIN_EXISTING_ELEMENTS)
    end

    def palette_item
      started = palette_started?
      Item.new(key: "palette", step: "design", done: started, panel: "palette") unless started.nil?
    end

    def design_elements_item
      count = features.where(layer: DESIGN_LAYERS).count
      Item.new(key: "design_elements", step: "design", done: count.positive?, panel: "elements", count:, target: 1)
    end

    def plant_plan_item
      count = features.where(layer: "plants").count
      Item.new(key: "plant_plan", step: "plant", done: count.positive?, panel: "elements", count:, target: 1)
    end

    def plant_list_item
      return unless map.respond_to?(:plant_list)
      count = ServiceRequest::Prefill.new(map).plants.size
      Item.new(key: "plant_list", step: "plant", done: count.positive?, panel: "palette", count:, target: 1)
    end

    def action_item
      Item.new(key: "take_action", step: "plant", done: map.service_requests.exists?, panel: "actions")
    end

    def features
      @features ||= map.features.active
    end

    # true / false, or nil when the palette area is not there (item omitted).
    def palette_started?
      if map.respond_to?(:palette_items)
        map.palette_items.exists?
      elsif defined?(PaletteItem) && PaletteItem.column_names.include?("map_id")
        PaletteItem.where(map_id: map.id).exists?
      end
    rescue StandardError => error
      Rails.logger.warn("Journey: palette unreadable (#{error.class}: #{error.message})")
      nil
    end
end
