require "test_helper"

class ProjectSheetLinkTest < ActiveSupport::TestCase
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @link = @map.create_project_sheet_link!(created_by: users(:michael))
  end

  test "a long unguessable token, one link per map" do
    assert_equal 32, @link.token.length
    assert_raises(ActiveRecord::RecordNotUnique) { ProjectSheetLink.create!(map: @map) }
  end

  test "reset gives a new address and starts over" do
    @link.update!(opened_at: 1.day.ago, submitted_at: 1.hour.ago, disabled_at: 1.minute.ago)
    old = @link.token
    @link.reset!
    refute_equal old, @link.token
    assert @link.enabled?
    assert_nil @link.opened_at
    assert_nil @link.submitted_at
  end

  test "live only while enabled and the map is not archived" do
    assert @link.live?
    @map.update!(archived_at: Time.current)
    refute @link.reload.live?
  end

  test "submitting mails the owner and the creator once each, if they still edit the map" do
    assert_equal [ users(:michael) ], @link.recipients
    editor = users(:alice)
    @map.memberships.find_by(user: editor).update!(role: "editor")
    @link.update!(created_by: editor)
    assert_equal [ users(:michael), editor ], @link.recipients
    assert_enqueued_emails 2 do
      @link.submit!
    end
    @map.memberships.find_by(user: editor).update!(role: "viewer")
    assert_equal [ users(:michael) ], @link.reload.recipients
  end
end
