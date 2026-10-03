require "test_helper"
require_relative "../test_helpers/billing_test_helper"

class AccountControllerTest < ActionDispatch::IntegrationTest
  include BillingTestHelper
  include ActionMailer::TestHelper

  setup { @user = users(:bob) }

  test "requires sign in" do
    get "/account"
    assert_redirected_to new_session_path
  end

  test "shows the profile and the plan summary" do
    @user.update!(avatar_url: "https://lh3.googleusercontent.com/a/x", google_uid: "g-1")
    @user.plan_purchases.create!(plan_key: "yearly", starts_at: 1.month.ago, expires_at: 11.months.from_now, stripe_checkout_session_id: "cs_1")
    sign_in_as @user
    with_billing do
      get "/account", headers: inertia_headers
      assert_response :success
      assert_equal "accounts/show", response.parsed_body["component"]
      account = response.parsed_body["props"]["account"]
      assert_equal [ "Bob", "bob@example.org", "yearly", true ], account.values_at("name", "email", "plan", "googleLinked")
      assert account["passExpiresAt"]
    end
  end

  test "updates the name" do
    sign_in_as @user
    patch "/account", params: { user: { name: "Robert Dupont", email_address: "evil@example.org" } }
    assert_redirected_to account_path
    assert_equal "Robert Dupont", @user.reload.name
    assert_equal "bob@example.org", @user.email_address
  end

  test "a deletion request e-mails Semisto and confirms to the user, and deletes nothing" do
    sign_in_as @user
    assert_enqueued_emails 2 do
      assert_no_difference [ "User.count", "Map.count" ] do
        post "/account/deletion_request"
      end
    end
    assert_redirected_to account_path
    assert_match "Votre demande a été envoyée", flash[:notice]
    perform_enqueued_jobs
    to_semisto, to_user = ActionMailer::Base.deliveries.last(2)
    assert_equal [ Billing.contact_email ], to_semisto.to
    assert_equal [ @user.email_address ], to_semisto.reply_to
    assert_includes to_semisto.subject, "bob@example.org"
    assert_equal [ @user.email_address ], to_user.to
  end
end
