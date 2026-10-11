# The task lists Semisto adds to a map the first time someone opens its
# « Tâches » view: one list per step of the journey, in the order of
# Semisto's method (read the place, water before plants). Texts live in
# config/locales/tasks.fr.yml (`tasks.defaults`); they are copied into the
# map, so the team renames, completes or deletes them freely.
#
# Each task may name the editor panel where it is done (`panel`) and the
# journey item that says when the map shows it done (`journey`, Journey).
class TaskList::Defaults
  LISTS = {
    "observe" => {
      "project_sheet" => { panel: "project", journey: "project_sheet" },
      "seasons_walk" => { panel: "photos" },
      "water_reading" => { panel: "relief" },
      "soil_test" => { panel: "soil" },
      "sun_and_wind" => { panel: "sun" }
    },
    "map" => {
      "boundary" => { panel: "terrain", journey: "boundary" },
      "existing" => { panel: "elements", journey: "existing" },
      "access_networks" => { panel: "elements" }
    },
    "design" => {
      "water" => { panel: "water-sources" },
      "access" => { panel: "elements" },
      "structure" => { panel: "elements", journey: "design_elements" },
      "palette" => { panel: "palette", journey: "palette" },
      "validate" => { panel: "discussions" }
    },
    "plant" => {
      "plant_list" => { panel: "plant-list", journey: "plant_list" },
      "soil_preparation" => {},
      "worksite" => { panel: "actions", journey: "take_action" },
      "planting" => { panel: "plant-list" },
      "aftercare" => {}
    }
  }.freeze

  TASKS = LISTS.values.reduce({}, :merge).freeze

  def self.panel_for(key) = key && TASKS.dig(key, :panel)
  def self.journey_for(key) = key && TASKS.dig(key, :journey)

  # Adds the default lists once per map (`tasks_seeded_at`), so deleting
  # them never brings them back. Returns true when it added them.
  def self.seed!(map, by: nil)
    return false if map.tasks_seeded_at
    map.with_lock do
      return false if map.tasks_seeded_at
      add_missing!(map, by:)
      map.update_column(:tasks_seeded_at, Time.current)
    end
    true
  end

  # Adds the default lists the map does not have (by key), at the end:
  # « Ajouter les tâches de Semisto » after they were deleted.
  def self.add_missing!(map, by: nil)
    existing = map.task_lists.where.not(key: nil).pluck(:key)
    LISTS.except(*existing).each do |list_key, tasks|
      list = map.task_lists.create!(key: list_key, name: I18n.t("tasks.defaults.#{list_key}.name"), created_by: by)
      tasks.each_key do |task_key|
        list.tasks.create!(
          map:, key: task_key, created_by: by,
          title: I18n.t("tasks.defaults.#{list_key}.tasks.#{task_key}.title"),
          notes: I18n.t("tasks.defaults.#{list_key}.tasks.#{task_key}.notes")
        )
      end
    end
  end
end
