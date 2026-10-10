require "test_helper"

class Account::PasswordsControllerTest < ActionDispatch::IntegrationTest
  setup { @user = users(:michael) }

  test "chooses a first password without an old one" do
    sign_in_as @user
    patch account_password_path, params: { user: { password: "une longue phrase", password_confirmation: "une longue phrase" } }
    assert_redirected_to account_path
    assert @user.reload.authenticate("une longue phrase")
  end

  test "refuses a short, blank or unconfirmed password" do
    sign_in_as @user
    patch account_password_path, params: { user: { password: "court", password_confirmation: "court" } }
    patch account_password_path, params: { user: { password: "", password_confirmation: "" } }
    patch account_password_path, params: { user: { password: "une longue phrase", password_confirmation: "une autre phrase" } }
    assert_not @user.reload.password?
  end

  test "changing it asks for the current one and signs out the other browsers" do
    @user.update!(password: "une longue phrase")
    other = @user.sessions.create!
    sign_in_as @user

    patch account_password_path, params: { user: { current_password: "faux", password: "une nouvelle phrase", password_confirmation: "une nouvelle phrase" } }
    assert @user.reload.authenticate("une longue phrase")
    assert Session.exists?(other.id)

    patch account_password_path, params: { user: { current_password: "une longue phrase", password: "une nouvelle phrase", password_confirmation: "une nouvelle phrase" } }
    assert @user.reload.authenticate("une nouvelle phrase")
    assert_not Session.exists?(other.id)
    assert Session.exists?(Current.session.id)
  end

  test "removes it with the current one" do
    @user.update!(password: "une longue phrase")
    sign_in_as @user
    delete account_password_path, params: { user: { current_password: "faux" } }
    assert @user.reload.password?
    delete account_password_path, params: { user: { current_password: "une longue phrase" } }
    assert_not @user.reload.password?
  end

  test "the account page says whether a password is set" do
    sign_in_as @user
    get account_path, headers: inertia_headers
    assert_equal false, response.parsed_body.dig("props", "account", "hasPassword")
  end
end
