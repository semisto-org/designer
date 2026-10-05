require "test_helper"

class MailBccInterceptorTest < ActionMailer::TestCase
  setup { @previous = ENV["MAIL_BCC_ADDRESS"] }
  teardown { ENV["MAIL_BCC_ADDRESS"] = @previous }

  def deliver_test_mail(**headers)
    ActionMailer::Base.mail(from: "no-reply@example.org", to: "someone@example.org", subject: "Test", body: "Bonjour", **headers).deliver_now
  end

  test "copies a real application e-mail (registered for every mailer)" do
    ENV["MAIL_BCC_ADDRESS"] = "hello@semisto.org"
    mail = MagicLinkMailer.sign_in(users(:michael)).deliver_now
    assert_equal [ "michael@example.org" ], mail.to
    assert_equal [ "hello@semisto.org" ], mail.bcc
  end

  test "adds nothing when the variable is unset or blank" do
    ENV.delete("MAIL_BCC_ADDRESS")
    deliver_test_mail
    assert_nil ActionMailer::Base.deliveries.last.bcc

    ENV["MAIL_BCC_ADDRESS"] = "  "
    deliver_test_mail
    assert_nil ActionMailer::Base.deliveries.last.bcc
  end

  test "accepts several comma-separated addresses and keeps an existing bcc" do
    ENV["MAIL_BCC_ADDRESS"] = "hello@semisto.org, archive@semisto.org"
    deliver_test_mail(bcc: "boss@example.org")
    assert_equal %w[boss@example.org hello@semisto.org archive@semisto.org], ActionMailer::Base.deliveries.last.bcc
  end

  test "does not copy an address that already receives the mail" do
    ENV["MAIL_BCC_ADDRESS"] = "Someone@example.org"
    deliver_test_mail
    assert_nil ActionMailer::Base.deliveries.last.bcc
  end

  test "the copy goes to the SMTP envelope, not to the visible recipients" do
    ENV["MAIL_BCC_ADDRESS"] = "hello@semisto.org"
    mail = deliver_test_mail
    assert_includes mail.smtp_envelope_to, "hello@semisto.org"
    assert_equal [ "someone@example.org" ], mail.to
  end
end
