require "test_helper"
require_relative "../test_helpers/drone_test_helper"

class DroneMailerTest < ActionMailer::TestCase
  include DroneTestHelper

  test "view_ready: to the map owner, in French, with the date, the map and how to find the view" do
    map = maps(:ahinvaux)
    view = aerial_view(map, plan_purchase: drone_order(users(:michael)))
    mail = DroneMailer.view_ready(view)

    assert_equal [ "michael@example.org" ], mail.to
    assert_equal "Votre vue drone est sur votre carte", mail.subject
    text = mail.text_part.body.to_s
    [ "Bonjour Michael,", "prise le 12 mai 2027", "« Domaine d'Ahinvaux »", "« Couches »", "« Vues drone »",
      "d'une saison, d'une année à l'autre", "http://example.com/maps/#{map.id}", "http://example.com/help/la-vue-drone",
      "visible par les personnes avec qui vous partagez cette carte" ].each do |fragment|
      assert_includes text, fragment
    end
    html = mail.html_part.body.to_s
    assert_includes html, "Ouvrir ma carte"
    assert_includes html, "href=\"http://example.com/maps/#{map.id}\""
  end
end
