require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  test "sends a magic link and signs in with it once" do
    assert_enqueued_emails 1 do
      post session_path, params: { email_address: "new@example.org" }
    end
    user = User.find_by!(email_address: "new@example.org")
    token = user.generate_token_for(:magic_link)
    get magic_link_path(token)
    assert_redirected_to root_url
    sign_out
    get magic_link_path(token)
    assert_redirected_to new_session_path
  end
end
