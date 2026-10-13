require "test_helper"

class Imports::Immich::JobBacklogTest < ActiveSupport::TestCase
  test "waits while more jobs are pending than allowed" do
    pending = [ 3, 2, 1 ]
    naps = []
    Imports::Immich::JobBacklog.new(pending: -> { pending.shift || 0 }, sleeper: ->(seconds) { naps << seconds }, clock: -> { 0 }).call
    assert_equal [ 1, 1 ], naps
  end

  test "gives up waiting after max_wait" do
    now = 0
    naps = 0
    Imports::Immich::JobBacklog.new(max_wait: 3, pending: -> { 50 }, sleeper: ->(seconds) { naps += 1; now += seconds }, clock: -> { now }).call
    assert_equal 3, naps
  end

  test "does not wait when jobs do not go through Solid Queue" do
    naps = 0
    Imports::Immich::JobBacklog.new(sleeper: ->(_) { naps += 1 }).call
    assert_equal 0, naps
  end
end
