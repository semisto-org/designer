require "test_helper"

class SessionTest < ActiveSupport::TestCase
  setup { @user = users(:bob) }

  test "a session unused for a year is idle and purged with its IP address" do
    now = Time.current
    kept = @user.sessions.create!(ip_address: "192.0.2.1", updated_at: now - 11.months)
    idle = @user.sessions.create!(ip_address: "192.0.2.2", updated_at: now - 13.months)
    assert idle.idle?(now)
    assert_not kept.idle?(now)
    assert_equal 1, Session.purge_idle!(now)
    assert Session.exists?(kept.id)
    assert_not Session.exists?(idle.id)
  end

  test "use moves the last-seen date at most once a day" do
    session = @user.sessions.create!(updated_at: 3.days.ago)
    assert session.seen!
    assert_in_delta Time.current, session.reload.updated_at, 2
    assert_not session.seen!, "seen again the same day"
  end

  test "the cookie lasts as long as an unused session is kept" do
    cookie = Session.cookie(42)
    assert_equal 42, cookie[:value]
    assert_in_delta Session::IDLE_TTL.from_now, cookie[:expires], 5
  end
end
