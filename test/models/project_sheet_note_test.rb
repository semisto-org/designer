require "test_helper"
require_relative "../test_helpers/teams_test_helper"
require_relative "../test_helpers/billing_test_helper"

class ProjectSheetNoteTest < ActiveSupport::TestCase
  include BillingTestHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = @map.owner
    @client = users(:alice) # a viewer of the map: maybe the client
  end

  test "on a map outside a team, only its owner with a pro account" do
    assert_not ProjectSheetNote.audience?(@map, @owner), "a personal account has no pro notes"
    @owner.update!(account_kind: "professional")
    assert ProjectSheetNote.audience?(@map, @owner)
    assert ProjectSheetNote.writable?(@map, @owner), "billing off: every pro"
    editor = make_user("Client")
    @map.memberships.create!(user: editor, role: "editor")
    assert_not ProjectSheetNote.audience?(@map, editor), "an editor invited on the map, maybe the client, never"
    assert_not ProjectSheetNote.audience?(@map, @client)
    assert_not ProjectSheetNote.audience?(@map, nil)
    assert_nil ProjectSheetNote.props_for(@map, editor)
  end

  test "on a team map, every member of the team and nobody else" do
    designer = make_user("Léa")
    team = make_team("Semisto", admin: @owner, members: [ designer ])
    @map.update!(organization: team)
    assert ProjectSheetNote.audience?(@map, designer)
    assert ProjectSheetNote.writable?(@map, designer)
    assert_not ProjectSheetNote.audience?(@map, @client)
    assert_equal "Semisto", ProjectSheetNote.props_for(@map, designer)[:teamName]
  end

  test "writing needs a pro plan; the notes stay readable without it" do
    @owner.update!(account_kind: "professional")
    ProjectSheetNote.write!(@map, "who", "Le fils reprendra le verger.", user: @owner, lock_version: nil)
    with_billing do
      assert ProjectSheetNote.audience?(@map, @owner)
      assert_not ProjectSheetNote.writable?(@map, @owner), "free plan"
      props = ProjectSheetNote.props_for(@map, @owner)
      assert_equal false, props[:canEdit]
      assert_equal "Le fils reprendra le verger.", props[:notes]["who"][:body]
      @owner.plan_subscriptions.create!(plan_key: "atelier", status: "active", stripe_subscription_id: "sub_pro")
      assert ProjectSheetNote.writable?(@map.reload, @owner), "Pro plan"
    end
  end

  test "an archived map keeps its notes read-only" do
    @owner.update!(account_kind: "professional")
    @map.archive!
    assert_not ProjectSheetNote.writable?(@map, @owner)
  end

  test "write, replace with the right version, remove with an empty text" do
    note = ProjectSheetNote.write!(@map, "budget", "  Budget **serré**  ", user: @owner, lock_version: nil)
    assert_equal "Budget **serré**", note.body
    assert_equal @owner, note.updated_by
    note = ProjectSheetNote.write!(@map, "budget", "Budget serré, subside possible", user: @owner, lock_version: note.lock_version)
    assert_equal "Budget serré, subside possible", note.reload.body
    assert_nil ProjectSheetNote.write!(@map, "budget", " ", user: @owner, lock_version: note.lock_version)
    assert_empty @map.project_sheet_notes.reload
  end

  test "a note written meanwhile is never silently replaced" do
    note = ProjectSheetNote.write!(@map, "time", "Disponible le week-end", user: @owner, lock_version: nil)
    assert_raises(ActiveRecord::StaleObjectError) { ProjectSheetNote.write!(@map, "time", "Autre", user: @owner, lock_version: nil) }
    assert_raises(ActiveRecord::StaleObjectError) { ProjectSheetNote.write!(@map, "time", "Autre", user: @owner, lock_version: note.lock_version + 1) }
    assert_raises(ActiveRecord::StaleObjectError) { ProjectSheetNote.write!(@map, "time", "", user: @owner, lock_version: nil) }
    assert_equal "Disponible le week-end", note.reload.body
  end

  test "only known sections, within the length limit" do
    assert_raises(ActiveRecord::RecordInvalid) { ProjectSheetNote.write!(@map, "secret", "x", user: @owner, lock_version: nil) }
    assert_raises(ActiveRecord::RecordInvalid) do
      ProjectSheetNote.write!(@map, "who", "x" * (ProjectSheetNote::MAX_LENGTH + 1), user: @owner, lock_version: nil)
    end
  end

  test "the notes never enter the sheet itself" do
    ProjectSheetNote.write!(@map, "who", "Interne", user: @owner, lock_version: nil)
    assert_not_includes @map.reload.project.to_json, "Interne"
  end
end
