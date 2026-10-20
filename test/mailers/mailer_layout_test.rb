require "test_helper"

class MailerLayoutTest < ActionMailer::TestCase
  test "every e-mail is French, branded and signed with a link to the site" do
    mail = MagicLinkMailer.sign_in(users(:bob))
    html = mail.html_part.body.to_s
    assert_includes html, '<html lang="fr">'
    assert_includes html, "Semisto Terranova"
    assert_includes html, ERB::Util.html_escape(I18n.t("mailer.footer"))
    assert_includes html, 'href="http://example.com/"'
    assert_includes mail.text_part.body.to_s, "#{I18n.t('mailer.footer')} http://example.com/"
  end

  test "an e-mail about a place opens on its vignette, name and area" do
    map = maps(:ahinvaux)
    invitation = map.invitations.create!(email_address: "new@example.org", role: "editor", invited_by: users(:michael))
    mail = MapInvitationMailer.invite(invitation)
    vignette = mail.attachments["lieu.png"]
    assert vignette&.inline?
    html = mail.html_part.body.to_s
    assert_includes html, "cid:#{vignette.cid}"
    assert_includes html, ERB::Util.html_escape("« Domaine d'Ahinvaux »")
    assert_includes mail.text_part.body.to_s, "« Domaine d'Ahinvaux »"
  end

  test "an e-mail without a place has no vignette" do
    mail = MagicLinkMailer.sign_in(users(:bob))
    assert_empty mail.attachments
  end

  test "mail_area reads like a person would say it" do
    helper = Object.new.extend(ActionView::Helpers::NumberHelper, MailerHelper)
    assert_equal "850\u202Fm²", helper.mail_area(850.4)
    assert_equal "2,4\u202Fha", helper.mail_area(24_100)
    assert_equal "1\u202Fha", helper.mail_area(10_000)
  end
end
