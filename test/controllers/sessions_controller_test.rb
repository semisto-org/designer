require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  test "sends a magic link and signs in with it once" do
    assert_enqueued_emails 1 do
      post session_path, params: { email_address: "new@example.org" }
    end
    user = User.find_by!(email_address: "new@example.org")
    token = user.generate_token_for(:magic_link)
    post magic_link_path(token)
    assert_redirected_to root_url
    sign_out
    post magic_link_path(token)
    assert_redirected_to new_session_path
  end

  test "opening the link only shows the button: a mail preview does not spend it" do
    user = users(:michael)
    token = user.generate_token_for(:magic_link)
    2.times do
      get magic_link_path(token, return_to: "/maps"), headers: inertia_headers
      assert_response :success
      assert_equal "magic_links/show", response.parsed_body["component"]
      assert_equal user.email_address, response.parsed_body.dig("props", "email")
      assert_equal magic_link_path(token, return_to: "/maps"), response.parsed_body.dig("props", "action")
    end
    assert_nil cookies[:session_id].presence

    post magic_link_path(token, return_to: "/maps")
    assert_redirected_to "/maps"
  end

  test "an expired or used link says so on opening" do
    get magic_link_path("nope")
    assert_redirected_to new_session_path
    assert_equal I18n.t("sessions.link_expired"), flash[:alert]
  end

  test "the e-mail carries a code that signs in on the device that asked" do
    perform_enqueued_jobs { post session_path, params: { email_address: users(:michael).email_address } }
    mail = ActionMailer::Base.deliveries.last
    code = mail.subject[/\d{6}/]
    assert code, "the subject shows the code"
    assert_includes mail.text_part.body.to_s, code

    post session_code_path, params: { email_address: users(:michael).email_address.upcase, code: "#{code[0, 3]} #{code[3, 3]}" }
    assert_redirected_to root_url
    assert users(:michael).reload.sign_in_code_digest.nil?, "a code serves once"
  end

  test "a wrong code is refused, and five wrong codes drop it" do
    user = users(:michael)
    code = user.issue_sign_in_code!
    wrong = code == "000000" ? "111111" : "000000"
    post session_code_path, params: { email_address: user.email_address, code: wrong }
    assert_redirected_to new_session_path(sent: user.email_address)
    assert_equal I18n.t("sessions.code_invalid"), flash[:alert]

    4.times { post session_code_path, params: { email_address: user.email_address, code: wrong } }
    post session_code_path, params: { email_address: user.email_address, code: }
    assert_redirected_to new_session_path(sent: user.email_address)
  end

  test "a code expires after 20 minutes, and signing in by link drops it" do
    user = users(:michael)
    code = user.issue_sign_in_code!
    travel 21.minutes do
      post session_code_path, params: { email_address: user.email_address, code: }
      assert_redirected_to new_session_path(sent: user.email_address)
    end

    code = user.issue_sign_in_code!
    post magic_link_path(user.generate_token_for(:magic_link))
    sign_out
    post session_code_path, params: { email_address: user.email_address, code: }
    assert_redirected_to new_session_path(sent: user.email_address)
  end

  test "signs in with a password, once one is chosen" do
    user = users(:michael)
    post session_password_path, params: { email_address: user.email_address, password: "" }
    assert_redirected_to new_session_path(password: 1)

    user.update!(password: "une longue phrase")
    post session_password_path, params: { email_address: user.email_address, password: "mauvais mot de passe" }
    assert_redirected_to new_session_path(password: 1)
    assert_equal I18n.t("sessions.password_invalid"), flash[:alert]

    post session_password_path, params: { email_address: " #{user.email_address.upcase} ", password: "une longue phrase" }
    assert_redirected_to root_url
  end
end
