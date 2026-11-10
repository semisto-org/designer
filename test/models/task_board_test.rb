require "test_helper"
require_relative "../test_helpers/teams_test_helper"

class TaskBoardTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
  end

  test "on a private map, everyone on it can be given a task, viewers included" do
    people = TaskBoard.new(@map).participants
    assert_equal %w[map map], people.pluck(:group)
    assert_equal [ users(:alice).id, users(:michael).id ].sort, people.pluck(:id).sort
    assert_equal "viewer", people.find { _1[:id] == users(:alice).id }[:role]
  end

  test "the project's team comes first, its lead leading, then the map's people, then the rest of the team" do
    team = make_team("Design Labs", admin: users(:michael), members: [ users(:bob) ])
    @map.update!(organization: team)
    @map.update_board!(lead_id: users(:bob).id)

    people = TaskBoard.new(@map).participants
    assert_equal [ users(:bob).id, users(:alice).id, users(:michael).id ], people.pluck(:id)
    assert_equal %w[crew map team], people.pluck(:group)
    assert_equal true, people.first[:lead]
  end

  test "while the project's team is not set, the team comes before the map's guests" do
    team = make_team("Design Labs", admin: users(:michael), members: [ users(:bob) ])
    @map.update!(organization: team)

    people = TaskBoard.new(@map).participants
    assert_equal %w[team team map], people.pluck(:group)
    assert_equal users(:alice).id, people.last[:id]
  end
end
