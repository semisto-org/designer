require "test_helper"

class MailerLayoutTest < ActionMailer::TestCase
  test "every e-mail is French, branded and signed with a link to the site" do
    mail = MagicLinkMailer.sign_in(users(:bob))
    html = mail.html_part.body.to_s
    assert_includes html, '<html lang="fr">'
    assert_includes html, "Semisto Designer"
    assert_includes html, ERB::Util.html_escape(I18n.t("mailer.footer"))
    assert_includes html, 'href="http://example.com/"'
    assert_includes mail.text_part.body.to_s, "#{I18n.t('mailer.footer')} http://example.com/"
  end
end
