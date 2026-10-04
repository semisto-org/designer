require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class MapTransferMailerTest < ActionMailer::TestCase
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @lea = add_member(@map, make_user("Léa", email: "lea@example.org"), "editor")
    @transfer = MapTransfer.propose!(map: @map, from: @owner, to: @lea)
  end

  test "the proposal goes to the recipient, links to their screen and says what changes" do
    mail = MapTransferMailer.proposed(@transfer)
    assert_equal [ "lea@example.org" ], mail.to
    assert_equal "Michael vous propose de devenir propriétaire de « Domaine d'Ahinvaux »", mail.subject
    assert_includes mail.html_part.body.to_s, "http://example.com/maps/#{@map.id}/transfers/#{@transfer.id}"
    text = mail.text_part.body.to_s
    assert_includes text, "/maps/#{@map.id}/transfers/#{@transfer.id}"
    assert_match(/suivrait alors votre formule/, text)
    assert_match(/Michael resterait éditeur/, text)
    assert_match(/Vous pouvez aussi décliner/, text)
    assert_match(/valable jusqu'au \d\d\/\d\d\/\d{4}/, text)
    assert_includes mail.html_part.body.to_s, '<html lang="fr">'
  end

  test "the former owner hears that the map was taken over and that they stay editor" do
    @transfer.accept!(by: @lea)
    mail = MapTransferMailer.accepted(@transfer)
    assert_equal [ @owner.email_address ], mail.to
    assert_equal "Léa est maintenant propriétaire de « Domaine d'Ahinvaux »", mail.subject
    text = mail.text_part.body.to_s
    assert_match(/Bonjour Michael,/, text)
    assert_match(/Vous restez éditeur de la carte/, text)
    assert_includes text, "http://example.com/maps/#{@map.id}"
  end

  test "the owner hears that the proposal was declined and that nothing changes" do
    @transfer.decline!(by: @lea)
    mail = MapTransferMailer.declined(@transfer)
    assert_equal [ @owner.email_address ], mail.to
    assert_equal "Léa a décliné votre proposition pour « Domaine d'Ahinvaux »", mail.subject
    assert_match(/la carte reste la vôtre/, mail.text_part.body.to_s)
  end
end
