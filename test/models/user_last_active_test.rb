require "test_helper"

class UserLastActiveTest < ActiveSupport::TestCase
  setup { @user = users(:bob) }

  test "active! writes the date, at most every five minutes" do
    at = Time.zone.parse("2026-11-16 10:00")
    @user.update_column(:last_active_at, nil)
    @user.active!(at)
    assert_equal at, @user.reload.last_active_at

    @user.active!(at + 4.minutes)
    assert_equal at, @user.reload.last_active_at

    @user.active!(at + 6.minutes)
    assert_equal at + 6.minutes, @user.reload.last_active_at
  end

  test "signing in counts as activity" do
    @user.update_column(:last_active_at, nil)
    @user.signed_in!
    assert_in_delta Time.current, @user.reload.last_active_at, 5
  end
end
