require "test_helper"
require_relative "../test_helpers/teams_test_helper"

# The team's own sections inside a column of the team board, and how a
# project sits in one (MapBoard).
class BoardSectionTest < ActiveSupport::TestCase
  setup do
    @team = make_team("Design Labs", admin: users(:michael), members: [ users(:bob) ])
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
    @pre = @team.board_sections.create!(phase: "design", name: "  Pré-design ")
    @detail = @team.board_sections.create!(phase: "design", name: "Design détaillé")
  end

  test "sections line up in their column, and move up or down" do
    assert_equal "Pré-design", @pre.name
    assert_equal [ 0, 1 ], [ @pre.position, @detail.position ]
    assert_equal 0, @team.board_sections.create!(phase: "offer", name: "Envoyée").position
    @detail.shift!(-1)
    assert_equal [ "Design détaillé", "Pré-design" ], @team.board_sections.where(phase: "design").ordered.pluck(:name)
    @detail.reload.shift!(-1)
    assert_equal 0, @detail.reload.position
  end

  test "a section has a known phase, a name, and a column holds a few" do
    assert_not @team.board_sections.new(phase: "harvest", name: "X").valid?
    assert_not @team.board_sections.new(phase: "design", name: " ").valid?
    (BoardSection::MAX_PER_PHASE - 2).times { |i| @team.board_sections.create!(phase: "design", name: "S#{i}") }
    assert_not @team.board_sections.new(phase: "design", name: "Une de trop").valid?
  end

  test "a project sits in a section of its own column" do
    @map.update_board!(section_id: @pre.id)
    assert_equal @pre, @map.reload.board_section
    other = @team.board_sections.create!(phase: "offer", name: "Envoyée")
    assert_raises(ActiveRecord::RecordInvalid) { @map.update_board!(section_id: other.id) }
    elsewhere = make_team("Autre", admin: users(:alice)).board_sections.create!(phase: "design", name: "Ailleurs")
    assert_raises(ActiveRecord::RecordInvalid) { @map.reload.update_board!(section_id: elsewhere.id) }
  end

  test "changing column leaves the section, unless the move names one of the new column" do
    @map.update_board!(section_id: @pre.id)
    @map.update_board!(phase: "offer")
    assert_nil @map.reload.board_section_id
    @map.update_board!(phase: "design", section_id: @detail.id)
    assert_equal [ "design", @detail.id ], [ @map.reload.phase, @map.board_section_id ]
  end

  test "on hold, a project keeps its section for when it wakes" do
    @map.update_board!(section_id: @pre.id)
    @map.update_board!(on_hold: true)
    assert @map.reload.on_hold?
    assert_equal @pre.id, @map.board_section_id
  end

  test "leaving the team leaves the section; deleting a section lets its projects go loose" do
    @map.update_board!(section_id: @pre.id)
    @pre.destroy!
    assert_nil @map.reload.board_section_id
    @map.update_board!(section_id: @detail.id)
    @map.update!(organization: nil)
    assert_nil @map.reload.board_section_id
  end
end
