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

  test "keeps only the known context keys, as short strings, and the deployed commit" do
    feedback = users(:alice).feedbacks.new(message: "ok", context: { "viewport" => "390×844", "pixel_ratio" => 3, "cookie" => "secret", "language" => "" })
    assert_equal({ "viewport" => "390×844", "pixel_ratio" => "3" }, feedback.context)
    with_env("SOURCE_COMMIT" => "0123456789abcdef") { feedback.save! }
    assert_equal "0123456789ab", feedback.app_version
  end

  test "answer! tells the author only of what they would care about" do
    feedback = users(:alice).feedbacks.create!(message: "Bug")
    admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)

    assert feedback.answer!(status: "reviewing", reply: "", by: admin)
    assert_nil feedback.author_notified_at, "« à l'étude » without a word is not worth an e-mail"
    assert_equal admin, feedback.handled_by
    assert feedback.status_changed_at

    assert feedback.answer!(status: "planned", reply: "On s'y met.", by: admin)
    assert feedback.author_notified_at
    assert_not feedback.answer!(status: "lost", reply: "", by: admin)
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
