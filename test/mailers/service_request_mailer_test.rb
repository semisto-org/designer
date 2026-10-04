require "test_helper"

class ServiceRequestMailerTest < ActionMailer::TestCase
  setup do
    @map = maps(:ahinvaux)
    @sr = @map.service_requests.create!(
      user: users(:michael), kind: "order_plants", contact_consent: true,
      payload: { "plants" => [ { "name" => "Noyer commun", "quantity" => 3 } ], "desired_period" => "Novembre 2026", "phone" => "0470 00 00 00", "message" => "Merci d'avance" }
    )
  end

  test "received: to Semisto, reply to the person, with a link to the map" do
    mail = ServiceRequestMailer.received(@sr)
    assert_equal [ "designer@semisto.org" ], mail.to
    assert_equal [ "michael@example.org" ], mail.reply_to
    assert_equal "Nouvelle demande : Commander des plants de qualité · Domaine d'Ahinvaux", mail.subject
    html = mail.html_part.body.to_s
    text = mail.text_part.body.to_s
    [ html, text ].each do |body|
      assert_includes body, "http://example.com/maps/#{@map.id}"
      assert_includes body, "Noyer commun × 3"
      assert_includes body, "Novembre 2026"
      assert_includes body, (body.equal?(html) ? CGI.escapeHTML("Merci d'avance") : "Merci d'avance")
      assert_includes body, "0470 00 00 00"
    end
    assert_includes text, "http://example.com/admin/requests"
  end

  test "received honours SEMISTO_REQUESTS_EMAIL" do
    original = ENV["SEMISTO_REQUESTS_EMAIL"]
    ENV["SEMISTO_REQUESTS_EMAIL"] = "plants@semisto.org,chantiers@semisto.org"
    assert_equal %w[plants@semisto.org chantiers@semisto.org], ServiceRequestMailer.received(@sr).to
  ensure
    original ? ENV["SEMISTO_REQUESTS_EMAIL"] = original : ENV.delete("SEMISTO_REQUESTS_EMAIL")
  end

  test "confirmation: to the person, recap, and what Semisto can see" do
    mail = ServiceRequestMailer.confirmation(@sr)
    assert_equal [ "michael@example.org" ], mail.to
    assert_equal "Ta demande à Semisto : Commander des plants de qualité", mail.subject
    text = mail.text_part.body.to_s
    assert_includes text, "Bonjour Michael,"
    assert_includes text, "Noyer commun × 3"
    assert_includes text, "lecture seule"
    assert_includes text, "http://example.com/maps/#{@map.id}"
  end
end
