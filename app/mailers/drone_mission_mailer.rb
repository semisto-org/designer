# The e-mails of a drone mission booked in the pilot directory, each with a
# link to the mission's page: to the pilot when a mission is asked, paid or
# cancelled, when they are paid, and when an undelivered mission is refunded; to the client when the pilot answers or
# delivers, and when Semisto refunds; to Semisto when a client disputes a
# delivery. One template (message) for all: a greeting, a few paragraphs, a
# button.
class DroneMissionMailer < ApplicationMailer
  before_action do
    @mission = params[:mission]
    @pilot = @mission.drone_pilot
    @client = @mission.client
    @url = drone_mission_url(@mission)
  end

  def requested = to_pilot(:requested, client: @client.display_name, map: @mission.map.name, message: @mission.message)
  def cancelled = to_pilot(:cancelled, client: @client.display_name, map: @mission.map.name)
  def paid = to_pilot(:paid, client: @client.display_name, map: @mission.map.name, date: date(@mission.flight_on))
  def paid_out = to_pilot(:paid_out, amount: euros(@mission.pilot_share_cents), map: @mission.map.name)
  def expired = compose(:expired, @pilot.user, reply_to: Billing.contact_email, client: @client.display_name, map: @mission.map.name, days: DroneMission::DELIVERY_DEADLINE.in_days.to_i)

  def accepted = to_client(:accepted, pilot: @pilot.display_name, date: date(@mission.flight_on), total: euros(@mission.total_cents), reply: @mission.pilot_reply.to_s)
  def declined = to_client(:declined, pilot: @pilot.display_name, reply: @mission.pilot_reply.to_s)
  def delivered = to_client(:delivered, pilot: @pilot.display_name, map: @mission.map.name, days: DroneMission::CONFIRMATION_DELAY.in_days.to_i, note: @mission.delivery_note.to_s)
  def refunded = to_client(:refunded, pilot: @pilot.display_name, total: euros(@mission.total_cents))

  def disputed
    @greeting = t("drone_missions.mailer.disputed.greeting")
    @paragraphs = t("drone_missions.mailer.disputed.body", id: @mission.id, client: @client.display_name, pilot: @pilot.display_name, message: @mission.dispute_message.to_s).split("\n\n")
    @button = t("drone_missions.mailer.disputed.button")
    @url = admin_drone_pilots_url
    mail to: Billing.contact_email, reply_to: @client.email_address, subject: t("drone_missions.mailer.disputed.subject", id: @mission.id), template_name: "message"
  end

  private
    def to_pilot(key, **vars) = compose(key, @pilot.user, reply_to: @client.email_address, **vars)
    def to_client(key, **vars) = compose(key, @client, reply_to: @pilot.user.email_address, **vars)

    def compose(key, recipient, reply_to:, **vars)
      @greeting = t("drone_missions.mailer.greeting", name: recipient.display_name)
      @paragraphs = t("drone_missions.mailer.#{key}.body", **vars).split("\n\n").map(&:strip).reject(&:empty?)
      @button = t("drone_missions.mailer.#{key}.button")
      mail to: recipient.email_address, reply_to:, subject: t("drone_missions.mailer.#{key}.subject", **vars), template_name: "message"
    end

    def euros(cents) = ActiveSupport::NumberHelper.number_to_currency(cents / 100.0, unit: "€", format: "%n %u", separator: ",", delimiter: " ", precision: 2)
    def date(value) = value ? Billing::FrenchDate.long(value) : t("drone_missions.mailer.date_to_agree")
end
