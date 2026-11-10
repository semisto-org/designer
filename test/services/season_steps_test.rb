require "test_helper"

class SeasonStepsTest < ActiveSupport::TestCase
  test "the planting window is this season's while it lasts, then the coming one" do
    assert_equal Date.new(2026, 11, 1)..Date.new(2027, 2, 28), SeasonSteps.window(Date.new(2026, 12, 15))
    assert_equal Date.new(2027, 11, 1)..Date.new(2028, 2, 29), SeasonSteps.window(Date.new(2027, 3, 1))
    json = SeasonSteps.window_json(Date.new(2026, 12, 15))
    assert json[:inSeason]
  end

  test "a step goes to the season list and takes its kind's name when it has none" do
    map = maps(:ahinvaux)
    task = SeasonSteps.create!(map, { step_kind: "site", title: "", starts_on: "2026-12-01", due_on: "2026-12-05", map_id: 0 }, by: users(:michael))
    assert_equal [ "Chantier", map.id, TaskList::SEASON_KEY ], [ task.title, task.map_id, task.task_list.key ]
    assert_includes SeasonSteps.coming([ map.id ], Date.new(2026, 11, 10)), task
    refute_includes SeasonSteps.coming([ map.id ], Date.new(2027, 1, 10)), task
  end
end
