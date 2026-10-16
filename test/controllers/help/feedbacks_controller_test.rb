require "test_helper"

class Help::FeedbacksControllerTest < ActionDispatch::IntegrationTest
  test "anyone can say a guide helped, then add what was missing" do
    post "/help/formules-et-forfait/feedback", params: { helpful: false }, as: :json
    assert_response :created
    feedback = HelpFeedback.last
    assert_equal [ "formules-et-forfait", false, nil, nil ], [ feedback.slug, feedback.helpful, feedback.user, feedback.comment ]

    patch "/help/feedback", params: { token: response.parsed_body["token"], comment: "  Le prix pour une école.  " }, as: :json
    assert_response :no_content
    assert_equal "Le prix pour une école.", feedback.reload.comment
  end

  test "a signed-in reader's answer remembers who gave it" do
    user = User.create!(email_address: "lecteur@example.org", name: "Lecteur")
    sign_in_as(user)
    post "/help/formules-et-forfait/feedback", params: { helpful: true }, as: :json
    assert_equal user, HelpFeedback.last.user
  end

  test "an unknown guide or a forged token is refused" do
    post "/help/inconnu/feedback", params: { helpful: true }, as: :json
    assert_response :unprocessable_entity
    patch "/help/feedback", params: { token: "faux", comment: "x" }, as: :json
    assert_response :not_found
  end
end
