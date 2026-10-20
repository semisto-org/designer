require "test_helper"

class FeedbackTest < ActiveSupport::TestCase
  test "needs words, trimmed, within the limit" do
    feedback = users(:alice).feedbacks.new(message: "  Je n'ai pas trouvé le contour.  ", path: "/maps/1")
    assert feedback.valid?
    assert_equal "Je n'ai pas trouvé le contour.", feedback.message
    assert_not users(:alice).feedbacks.new(message: "   ").valid?
    assert_not users(:alice).feedbacks.new(message: "x" * (Feedback::MESSAGE_LIMIT + 1)).valid?
    assert_not users(:alice).feedbacks.new(message: "ok", sentry_replay_id: "abc").valid?
  end

  test "keeps only a path of this site" do
    assert_equal "/maps/3/palette", users(:alice).feedbacks.new(message: "ok", path: "/maps/3/palette").path
    assert_nil users(:alice).feedbacks.new(message: "ok", path: "javascript:alert(1)").path
    assert_nil users(:alice).feedbacks.new(message: "ok", path: "https://ailleurs.example").path
  end

  test "goes away with its author" do
    user = User.create!(email_address: "testeuse@example.org", name: "Testeuse")
    feedback = user.feedbacks.create!(message: "Bravo", map: maps(:ahinvaux))
    user.destroy!
    assert_not Feedback.exists?(feedback.id)
  end
end
