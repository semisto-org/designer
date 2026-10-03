require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class CollabMailersTest < ActionMailer::TestCase
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @alice = users(:alice)
  end

  test "invitation mail links to /invitations/:token and states the role" do
    invitation = @map.invitations.create!(email_address: "new@example.org", role: "editor", invited_by: @owner)
    mail = MapInvitationMailer.invite(invitation)
    assert_equal [ "new@example.org" ], mail.to
    assert_match(/Michael vous invite sur la carte « Domaine d'Ahinvaux »/, mail.subject)
    assert_includes mail.html_part.body.to_s, "http://example.com/invitations/#{invitation.token}"
    assert_includes mail.text_part.body.to_s, "/invitations/#{invitation.token}"
    assert_match(/éditeur/, mail.text_part.body.to_s)
    assert_match(/valable jusqu'au \d\d\/\d\d\/\d{4}/, mail.text_part.body.to_s)
  end

  test "mention mail: escaped body, mention in bold, link to the thread" do
    feature = with_feature(@map, name: "Noyer")
    comment = Comment.create!(commentable: feature, author: @owner, body: "<script>alert(1)</script> @Alice voici\nla suite")
    mail = CommentMailer.mentioned(comment, @alice)
    html = mail.html_part.body.to_s
    assert_not_includes html, "<script>"
    assert_includes html, "&lt;script&gt;"
    assert_includes html, "<strong>@Alice</strong>"
    assert_includes html, "discussion=MapFeature%3A#{feature.id}"
    assert_match(/Michael vous a mentionné dans « Noyer »/, mail.subject)
    assert_includes mail.text_part.body.to_s, "voici\nla suite"
  end

  test "new comment mail on the map's own thread" do
    comment = Comment.create!(commentable: @map, author: @owner, body: "Réunion samedi")
    mail = CommentMailer.new_comment(comment, @alice)
    assert_equal [ @alice.email_address ], mail.to
    assert_match(/Michael a commenté « Domaine d'Ahinvaux »/, mail.subject)
    assert_includes mail.html_part.body.to_s, "discussion=Map%3A#{@map.id}"
    assert_match(/Pour ne plus recevoir ces e-mails/, mail.text_part.body.to_s)
  end

  test "mails are sent from MAIL_FROM" do
    comment = Comment.create!(commentable: @map, author: @owner, body: "Salut")
    assert_equal [ "designer@semisto.org" ], CommentMailer.new_comment(comment, @alice).from
  end
end
