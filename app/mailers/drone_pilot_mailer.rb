# The e-mails of a pilot's application to the directory: to Semisto when it
# arrives, to the pilot once it is approved (with the next step: their
# Stripe account) or refused (with Semisto's reason).
class DronePilotMailer < ApplicationMailer
  before_action do
    @pilot = params[:pilot]
    @url = drone_pilot_profile_url
  end

  def applied
    @greeting = t("drone_pilots.mailer.applied.greeting")
    @paragraphs = [ t("drone_pilots.mailer.applied.body", name: @pilot.display_name, place: @pilot.base_place, operator: @pilot.operator_number) ]
    @button = t("drone_pilots.mailer.applied.button")
    @url = admin_drone_pilots_url
    mail to: Billing.contact_email, reply_to: @pilot.user.email_address, subject: t("drone_pilots.mailer.applied.subject", name: @pilot.display_name),
      template_name: "message"
  end

  def approved = to_pilot(:approved)
  def rejected = to_pilot(:rejected, note: @pilot.review_note.to_s)

  private
    def to_pilot(key, **vars)
      @greeting = t("drone_missions.mailer.greeting", name: @pilot.user.display_name)
      @paragraphs = t("drone_pilots.mailer.#{key}.body", **vars).split("\n\n").map(&:strip).reject(&:empty?)
      @button = t("drone_pilots.mailer.#{key}.button")
      mail to: @pilot.user.email_address, subject: t("drone_pilots.mailer.#{key}.subject"), template_name: "message"
    end
end
