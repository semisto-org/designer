require "test_helper"

class ProjectSheetDraftTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def build(section: "budget", field: "initial", value: "up_to_2000", rationale: "Dit pendant l'entretien.")
    @map.project_sheet_drafts.new(section:, field:, value:, rationale:)
  end

  test "a value must fit the sheet's schema" do
    assert build.valid?
    refute build(value: "a_lot").valid?
    refute build(field: "size").valid?
    refute build(section: "garden").valid?
    refute build(value: []).valid?, "an empty answer is not a proposal"
    refute build(rationale: "").valid?
    assert build(section: "who", field: "people", value: [ { "name" => "Marie", "role" => "lead" } ]).valid?
  end

  test "one pending answer per field" do
    build.save!
    refute build(value: "up_to_5000").valid?
  end

  test "accept! merges every draft in one patch and keeps the other answers" do
    @map.update!(project: { "budget" => { "yearly" => "under_100" } })
    drafts = [ build.tap(&:save!), build(section: "time", field: "hours_per_week", value: 5).tap(&:save!) ]
    sheet = ProjectSheetDraft.accept!(@map, drafts)
    assert_equal({ "yearly" => "under_100", "initial" => "up_to_2000" }, sheet.section("budget"))
    assert_equal 5, @map.reload.project.dig("time", "hours_per_week")
    assert_empty @map.project_sheet_drafts
  end

  test "drafts go with their map" do
    build.save!
    assert_difference("ProjectSheetDraft.count", -1) { @map.destroy }
  end
end
