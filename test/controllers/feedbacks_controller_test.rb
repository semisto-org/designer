require "test_helper"
require_relative "../test_helpers/first_hour_test_helper"

class FeedbacksControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper
  include FirstHourTestHelper

  test "requires sign in" do
    post feedback_path, params: { feedback: { message: "Bonjour" } }, as: :json
    assert_response :redirect
    assert_equal 0, Feedback.count
  end

  test "keeps the words, the page and the map, and writes to Semisto" do
    sign_in_as users(:alice)
    map = maps(:ahinvaux)
    assert_enqueued_emails 1 do
      post feedback_path, params: { feedback: { message: "Je cherche le contour", path: "/maps/#{map.id}", map_id: map.id, wants_call: true, sentry_replay_id: REPLAY_ID } }, as: :json
    end
    assert_response :created
    feedback = Feedback.last
    assert_equal users(:alice), feedback.user
    assert_equal "Je cherche le contour", feedback.message
    assert_equal "/maps/#{map.id}", feedback.path
    assert_equal map, feedback.map
    assert feedback.wants_call
    assert_equal REPLAY_ID, feedback.sentry_replay_id
  end

  test "a map the person cannot open is left out" do
    sign_in_as users(:bob)
    post feedback_path, params: { feedback: { message: "Hum", map_id: maps(:ahinvaux).id } }, as: :json
    assert_response :created
    assert_nil Feedback.last.map
  end

  test "an empty message is refused" do
    sign_in_as users(:alice)
    post feedback_path, params: { feedback: { message: "  " } }, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, Feedback.count
  end

  test "an admin signed in as someone cannot write in their name" do
    sign_in_as User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    post admin_user_impersonation_path(users(:alice))
    post feedback_path, params: { feedback: { message: "Test" } }, as: :json
    assert_equal 0, Feedback.count
  end
end
