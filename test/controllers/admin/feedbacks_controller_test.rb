require "test_helper"

class Admin::FeedbacksControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @feedback = users(:alice).feedbacks.create!(message: "Le bouton est caché")
    @done = users(:bob).feedbacks.create!(message: "Merci", status: "done")
  end

  test "only staff see the triage" do
    sign_in_as users(:alice)
    get admin_feedbacks_path
    assert_response :not_found
  end

  test "lists what still waits, by default, with counts per status" do
    sign_in_as @admin
    get admin_feedbacks_path, headers: inertia_headers
    assert_response :success
    props = inertia_props
    assert_equal [ @feedback.id ], props["feedbacks"].map { _1["id"] }
    assert_equal 1, props["counts"]["awaiting"]
    assert_equal 1, props["counts"]["done"]
    assert_equal 2, props["counts"]["all"]

    get admin_feedbacks_path(status: "done"), headers: inertia_headers
    assert_equal [ @done.id ], inertia_props["feedbacks"].map { _1["id"] }
  end

  test "answering sets the status and the reply and tells the author" do
    sign_in_as @admin
    assert_enqueued_emails 1 do
      patch admin_feedback_path(@feedback), params: { feedback: { status: "done", reply: "C'est corrigé !", notify: "true" } }
    end
    assert_response :see_other
    @feedback.reload
    assert_equal "done", @feedback.status
    assert_equal "C'est corrigé !", @feedback.reply
    assert_equal @admin, @feedback.handled_by
    assert @feedback.author_notified_at
  end

  test "without notify, nobody is written to" do
    sign_in_as @admin
    assert_no_enqueued_emails do
      patch admin_feedback_path(@feedback), params: { feedback: { status: "planned", reply: "", notify: "false" } }
    end
    assert_equal "planned", @feedback.reload.status
    assert_nil @feedback.author_notified_at
  end

  private
    def inertia_props = response.parsed_body["props"]
end
