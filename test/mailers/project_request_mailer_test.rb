require "test_helper"

class ProjectRequestMailerTest < ActionMailer::TestCase
  setup do
    @form = RequestForm.create!(owner: users(:michael))
    @request = @form.project_requests.create!(name: "Marie Dupont", email: "marie@example.org", address: "Rue du Bois 1, Yvoir",
      message: "Un verger", parcels: [ { "capakey" => "A1", "lng" => 4.9, "lat" => 50.3 } ])
  end

  test "the team learns of a request and can answer the prospect directly" do
    mail = ProjectRequestMailer.received(@request, users(:michael))
    assert_equal [ "michael@example.org" ], mail.to
    assert_equal [ "marie@example.org" ], mail.reply_to
    assert_equal "Nouvelle demande de projet · Marie Dupont · Rue du Bois 1, Yvoir", mail.subject
    assert_includes mail.text_part.body.to_s, "/request_forms/#{@form.id}/requests/#{@request.id}"
    assert_includes mail.html_part.body.to_s, "Un verger"
  end

  test "the prospect gets a confirmation, in « vous »" do
    mail = ProjectRequestMailer.confirmation(@request)
    assert_equal [ "marie@example.org" ], mail.to
    assert_includes mail.text_part.body.to_s, "nous vous appelons"
  end
end
