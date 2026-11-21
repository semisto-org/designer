module Earthworks
  # A work that moves water or soil (a swale, a pond, a mound…) is a guess
  # until the land has answered: the relief model is a metre-grid and a few
  # centimetres decide where a downpour goes. Each new one gets a task on its
  # map, « after the next heavy rain, go and see where the water really
  # runs », tied to the work, whoever traced it (in 3D, on the map, on the
  # phone, or an AI draft accepted). The answer is a relief « Pendant
  # l'averse » noted on the land (storm_observation), read by the MCP's
  # get_storm_observations.
  class RainCheck
    KINDS = %w[swale keyline ditch pond mound check_dam beaver_dam_analogue fascine hedge_bank half_moon].freeze
    TASK_KEY = "rain_check".freeze
    LIST_KEY = "rain_checks".freeze

    def self.applies_to?(feature)
      KINDS.include?(feature.kind) && feature.status == "active" && feature.layer != "existing"
    end

    # The task (added once per work), or nil when the work needs none.
    def self.add!(feature, by:)
      return nil unless applies_to?(feature)

      existing = for_feature(feature)
      return existing if existing

      map = feature.map
      list = map.task_lists.find_by(key: LIST_KEY) ||
        map.task_lists.create!(key: LIST_KEY, name: I18n.t("earthworks.rain_check.list"), created_by: by)
      list.tasks.create!(
        map:, key: TASK_KEY, created_by: by, features: [ feature ],
        title: I18n.t("earthworks.rain_check.title", work: work_name(feature)).truncate(Task::TITLE_MAX_LENGTH),
        notes: I18n.t("earthworks.rain_check.notes.#{feature.kind}", default: I18n.t("earthworks.rain_check.notes.default"))
      )
    end

    # Adds the tasks of several works (drafts accepted at once); returns them.
    def self.add_all!(features, by:) = features.filter_map { add!(_1, by:) }

    def self.for_feature(feature)
      Task.where(map_id: feature.map_id, key: TASK_KEY).about([ feature.id ]).order(:id).first
    end

    # What the MCP and the 3D view say of a work's check: the task and
    # whether it is done, and the downpours noted since the work was traced.
    def self.summary(feature)
      task = for_feature(feature)
      return nil unless task || applies_to?(feature)

      observations = feature.map.features.active.where(kind: "storm_observation").where(created_at: feature.created_at..)
      { task_id: task&.id, title: task&.title, done: task&.done? || false, storm_observations_since: observations.count }
    end

    def self.work_name(feature)
      kind = I18n.t("editor.kinds.#{feature.kind}", default: feature.kind.humanize)
      feature.name.present? ? "#{kind} « #{feature.name} »" : kind
    end
  end
end
