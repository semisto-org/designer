require "test_helper"

class ApplicationCable::ConnectionTest < ActionCable::Connection::TestCase
  test "connects with a session cookie" do
    session = users(:alice).sessions.create!
    cookies.signed[:session_id] = session.id
    connect
    assert_equal users(:alice), connection.current_user
  end

  test "rejects anonymous connections" do
    assert_reject_connection { connect }
  end
end
