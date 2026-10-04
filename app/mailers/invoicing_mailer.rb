# « Payer sur facture »: the request to Semisto (SEMISTO_CONTACT_EMAIL,
# replying goes to the person), its acknowledgement, the notice that the
# plan is active, and the renewal reminders of a plan paid on invoice.
class InvoicingMailer < ApplicationMailer
  helper_method :euros, :french_date

  def request_received(invoice_request)
    load_request(invoice_request)
    @admin_url = admin_invoice_requests_url
    mail to: Billing.contact_email,
      reply_to: email_address_with_name(@user.email_address, @user.display_name),
      subject: t(".subject", organization: @request.organization_name, plan: @request.plan_name)
  end

  def request_confirmation(invoice_request)
    load_request(invoice_request)
    @billing_url = billing_url
    mail to: @user.email_address, subject: t(".subject")
  end

  def plan_activated(grant)
    @grant = grant
    @user = grant.user
    @plan = I18n.t("billing.plans.#{grant.plan_key}.name")
    @maps_url = maps_url
    mail to: @user.email_address, subject: t(".subject", plan: @plan)
  end

  # kind: "d30" (30 days before the end), "d7", "expired".
  def grant_reminder(grant, kind)
    @grant = grant
    @user = grant.user
    @kind = kind
    @plan = I18n.t("billing.plans.#{grant.plan_key}.name")
    @ends_on = french_date(grant.ends_at)
    @read_only_maps = @user.read_only_maps_count
    @renew_url = new_invoice_request_url(plan: grant.plan_key)
    mail to: @user.email_address, subject: t(".#{kind}.subject", date: @ends_on)
  end

  private
    def load_request(invoice_request)
      @request = invoice_request
      @user = invoice_request.user
      @amount = euros(invoice_request.amount_cents)
    end

    # "1 188 €", "55,30 €".
    def euros(cents)
      precision = (cents % 100).zero? ? 0 : 2
      ActiveSupport::NumberHelper.number_to_currency(cents / 100.0, unit: "€", format: "%n %u", separator: ",", delimiter: " ", precision:)
    end

    def french_date(time) = Billing::FrenchDate.long(time)
end
