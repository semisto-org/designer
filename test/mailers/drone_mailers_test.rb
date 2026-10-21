require "test_helper"
require "test_helpers/drone_pilots_test_helper"

# Every e-mail of the pilot directory renders in French, to the right
# person, with nothing left untranslated.
class DroneMailersTest < ActionMailer::TestCase
  include DronePilotsTestHelper

  setup do
    @pilot = create_pilot(users(:bob))
    @mission = paid_mission(pilot: @pilot, client: users(:michael), map: maps(:ahinvaux))
    @mission.update!(delivery_note: "Orthophoto déposée", dispute_message: "Il manque le nord", pilot_reply: "Avec plaisir")
  end

  def check(mail, to:)
    assert_equal [ to ], mail.to
    body = mail.text_part.body.to_s + mail.subject
    refute_match(/translation missing|%\{/i, body)
    body
  end

  test "the mission e-mails" do
    { requested: "bob", cancelled: "bob", paid: "bob", paid_out: "bob", expired: "bob",
      accepted: "michael", declined: "michael", delivered: "michael", refunded: "michael" }.each do |name, who|
      check(DroneMissionMailer.with(mission: @mission).public_send(name), to: users(who).email_address)
    end
    assert_match "15 février 2027", check(DroneMissionMailer.with(mission: @mission).paid, to: "bob@example.org")
    assert_match "Il manque le nord", check(DroneMissionMailer.with(mission: @mission).disputed, to: Billing.contact_email)
  end

  test "the application e-mails" do
    @pilot.update!(review_note: "L'assurance manque.")
    check(DronePilotMailer.with(pilot: @pilot).applied, to: Billing.contact_email)
    check(DronePilotMailer.with(pilot: @pilot).approved, to: "bob@example.org")
    assert_match "L'assurance manque.", check(DronePilotMailer.with(pilot: @pilot).rejected, to: "bob@example.org")
  end
end
