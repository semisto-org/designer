# /billing/invoice — « Payer sur facture »: a commune, a school, an
# association or a company asks for an invoice payable by bank transfer
# (InvoiceRequest). Signed-out visitors coming from the pricing page sign in
# first and come back here.
class InvoiceRequestsController < ApplicationController
  rate_limit to: 5, within: 1.hour, only: :create, by: -> { Current.user&.id || request.remote_ip },
    with: -> { redirect_to new_invoice_request_path, alert: t("invoicing.rate_limited"), status: :see_other }

  def new
    render inertia: "invoice_requests/new", props: {
      plans: InvoiceRequest.plans_json,
      defaults: {
        planKey: params[:plan].presence_in(InvoiceRequest::PLAN_KEYS) || "atelier",
        billingEmail: Current.user.email_address
      }
    }
  end

  def create
    invoice_request = Current.user.invoice_requests.new(invoice_request_params)
    if invoice_request.save
      redirect_to invoice_request_path(invoice_request), notice: t("invoicing.created"), status: :see_other
    else
      redirect_to new_invoice_request_path, inertia: { errors: invoice_request.errors }, status: :see_other
    end
  end

  # The confirmation, and later the request's status.
  def show
    invoice_request = Current.user.invoice_requests.find(params[:id])
    render inertia: "invoice_requests/show", props: {
      invoiceRequest: invoice_request.as_member_json.merge(
        billingAddress: invoice_request.billing_address, billingEmail: invoice_request.billing_email,
        companyNumber: invoice_request.company_number, message: invoice_request.message
      ),
      userEmail: Current.user.email_address
    }
  end

  private
    def invoice_request_params
      params.require(:invoice_request).permit(:organization_name, :billing_address, :company_number, :billing_email, :purchase_order, :plan_key, :message)
    end
end
