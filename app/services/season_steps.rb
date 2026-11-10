# The season steps of a project (design, work site, planting): tasks of its
# map with a start as well as a due date, kept in the map's season list
# (TaskList.season!). One source for every frieze that draws them: the
# map's « Tâches » page (this project alone) and the team board (every
# project of the team). A step may be a forecast (« prévisionnel »: an
# offer not signed yet), confirmed later with `forecast: false`.
module SeasonSteps
  # Bare-root planting: 1 November to the end of February.
  PLANTING_OPENS = [ 11, 1 ].freeze
  PLANTING_CLOSES = [ 2, -1 ].freeze
  PERMITTED = %i[title step_kind starts_on due_on forecast].freeze

  module_function

  # This season's or the coming season's planting window.
  def window(today = Date.current)
    closes_this_year = Date.new(today.year, *PLANTING_CLOSES)
    if today <= closes_this_year
      Date.new(today.year - 1, *PLANTING_OPENS)..closes_this_year
    else
      Date.new(today.year, *PLANTING_OPENS)..Date.new(today.year + 1, *PLANTING_CLOSES)
    end
  end

  def window_json(today = Date.current)
    season = window(today)
    in_season = season.cover?(today)
    {
      opensOn: season.begin.iso8601, closesOn: season.end.iso8601, inSeason: in_season,
      weeks: ((in_season ? season.end - today : season.begin - today).to_i / 7.0).ceil
    }
  end

  # The steps of `maps` drawn on the twelve months from the start of this month.
  def coming(maps, today = Date.current)
    from = today.beginning_of_month
    Task.steps.where(map_id: maps).where(due_on: from..).where(starts_on: ..(from + 12.months)).order(:starts_on, :id)
  end

  def json(task)
    { id: task.id, mapId: task.map_id, kind: task.step_kind, title: task.title,
      startsOn: task.starts_on.iso8601, dueOn: task.due_on.iso8601, done: task.done?, forecast: task.forecast }
  end

  # Adds a step to `map`, in its season list; an empty name takes the kind's.
  def create!(map, attrs, by:)
    attrs = attrs.to_h.symbolize_keys.slice(*PERMITTED)
    kind = attrs[:step_kind].to_s
    title = attrs[:title].presence || I18n.t("team_board.steps.#{kind}", default: kind)
    TaskList.season!(map, by:).tasks.create!(attrs.merge(map:, created_by: by, title:))
  end
end
