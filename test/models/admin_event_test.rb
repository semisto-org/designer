require "test_helper"

class AdminEventTest < ActiveSupport::TestCase
  test "keeps who did what to whom after the accounts are deleted" do
    admin = User.create!(email_address: "staff@example.org", admin: true)
    target = User.create!(email_address: "gone@example.org")
    event = AdminEvent.record!("impersonation_started", admin:, target:)
    target.destroy!
    admin.destroy!
    event.reload
    assert_nil event.target_user_id
    assert_nil event.admin_id
    json = event.as_admin_json
    assert_equal "staff@example.org", json[:admin][:name]
    assert_equal "gone@example.org", json[:target][:name]
  end

  test "only known actions" do
    assert_raises(ActiveRecord::RecordInvalid) { AdminEvent.record!("delete_everything", admin: nil) }
  end
end

class SessionImpersonationTest < ActiveSupport::TestCase
  test "an impersonation session lasts one hour" do
    admin = User.create!(email_address: "staff@example.org", admin: true)
    session = users(:alice).sessions.create!(impersonator: admin)
    assert session.impersonation?
    assert_not session.impersonation_expired?
    assert session.impersonation_expired?(session.created_at + 1.hour)
    assert_not users(:alice).sessions.create!.impersonation_expired?
  end
end
