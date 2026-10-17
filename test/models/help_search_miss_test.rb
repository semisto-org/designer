require "test_helper"

class HelpSearchMissTest < ActiveSupport::TestCase
  test "counts the same search once per time it is made, normalised" do
    HelpSearchMiss.record("Licorne")
    HelpSearchMiss.record("licorne ", at: 1.minute.from_now)
    assert_equal [ [ "licorne", 2 ] ], HelpSearchMiss.pluck(:query, :count)
  end

  test "ignores searches too short to mean anything" do
    HelpSearchMiss.record("ab")
    HelpSearchMiss.record("   ")
    assert_equal 0, HelpSearchMiss.count
  end

  test "keeps only the last word of a search typed letter by letter" do
    now = Time.current
    HelpSearchMiss.record("lico", at: now)
    HelpSearchMiss.record("licor", at: now + 1.second)
    HelpSearchMiss.record("licorne", at: now + 2.seconds)
    assert_equal [ "licorne" ], HelpSearchMiss.pluck(:query)
  end

  test "a beginning searched again later is a search of its own" do
    now = Time.current
    HelpSearchMiss.record("lico", at: now)
    HelpSearchMiss.record("licorne", at: now + 1.minute)
    assert_equal %w[licorne lico], HelpSearchMiss.most_searched.pluck(:query).sort.reverse
  end
end
