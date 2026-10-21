require "test_helper"
require_relative "../test_helpers/first_hour_test_helper"

class FeedbackMailerTest < ActionMailer::TestCase
  include FirstHourTestHelper

  test "received: to Semisto, replying to the person, with the page, the map, the call and the replay" do
    map = maps(:ahinvaux)
    feedback = users(:alice).feedbacks.create!(message: "Le bouton <b>Contour</b> est introuvable", path: "/maps/#{map.id}", map:, wants_call: true, sentry_replay_id: replay_id(5))
    mail = with_replay_env("SENTRY_ORG" => "semisto") { FeedbackMailer.received(feedback).tap(&:deliver_now) }

    assert_equal [ Billing.contact_email ], mail.to
    assert_equal [ "alice@example.org" ], mail.reply_to
    assert_equal "Un retour sur Terranova de Alice", mail.subject
    text = mail.text_part.body.to_s
    [ "Alice (alice@example.org) a écrit depuis http://example.com/maps/#{map.id}", "Le bouton <b>Contour</b> est introuvable",
      "Carte : Domaine d'Ahinvaux (http://example.com/maps/#{map.id})", "veut bien qu'on l'appelle",
      "https://semisto.sentry.io/replays/#{replay_id(5)}/", "http://example.com/admin/first-hours" ].each do |fragment|
      assert_includes text, fragment
    end
    html = mail.html_part.body.to_s
    assert_includes html, "&lt;b&gt;Contour&lt;/b&gt;"
    assert_includes html, "href=\"http://example.com/maps/#{map.id}\""
  end
end
