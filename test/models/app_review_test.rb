require "test_helper"

class AppReviewTest < ActiveSupport::TestCase
  test "off unless both the e-mail and a long enough code are set" do
    with_env("APP_REVIEW_EMAIL" => nil, "APP_REVIEW_CODE" => "x" * 20) { assert_not AppReview.enabled? }
    with_env("APP_REVIEW_EMAIL" => "review@example.org", "APP_REVIEW_CODE" => "short") { assert_not AppReview.enabled? }
    with_env("APP_REVIEW_EMAIL" => "review@example.org", "APP_REVIEW_CODE" => "x" * 16) { assert AppReview.enabled? }
  end

  test "matches only that e-mail with that code" do
    with_env("APP_REVIEW_EMAIL" => "Review@Example.org ", "APP_REVIEW_CODE" => "correct-horse-battery") do
      assert AppReview.match?("review@example.org", "correct-horse-battery")
      assert AppReview.match?(" REVIEW@example.org", "correct-horse-battery ")
      assert_not AppReview.match?("review@example.org", "wrong-horse-battery!!")
      assert_not AppReview.match?("other@example.org", "correct-horse-battery")
      assert_not AppReview.match?("", "")
    end
  end

  private
    def with_env(values)
      previous = values.keys.to_h { |key| [ key, ENV[key] ] }
      values.each { |key, value| ENV[key] = value }
      yield
    ensure
      previous.each { |key, value| ENV[key] = value }
    end
end
