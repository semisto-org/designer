# Semisto staff: invoice requests (« Payer sur facture ») and what to do
# with them: send the invoice through Stripe (when billing is on), start the
# plan before the payment, mark the request paid, or cancel it. Admins only
# (anyone else gets a 404, as if the page did not exist).
module Admin
  class InvoiceRequestsController < ApplicationController
    before_action :require_admin!
    before_action :set_invoice_request, except: :index

    FILTERS = %w[open paid cancelled all].freeze

    def index
      filter = FILTERS.include?(params[:status]) ? params[:status] : "open"
      scope = InvoiceRequest.includes(:user, :handled_by, :plan_grant).newest_first
      scope = case filter
      when "open" then scope.pending
      when "all" then scope
      else scope.where(status: filter)
      end
      render inertia: "admin/invoice_requests/index", props: {
        requests: scope.limit(300).map(&:as_admin_json),
        counts: counts,
        filters: { status: filter },
        stripeEnabled: Billing.enabled?
      }
    end

    # « Créer la facture dans Stripe »
    def invoice
      Billing::InvoiceIssuer.call(@invoice_request, by: Current.user)
      done t("invoicing.admin.flash.invoiced", email: @invoice_request.billing_email)
    rescue Billing::InvoiceIssuer::Unavailable => e
      refuse t("invoicing.admin.errors.#{e.reason}")
    rescue Providers::StripeGateway::Error => e
      stripe_refused(e)
    end

    def mark_paid
      return refuse(t("invoicing.admin.errors.closed")) unless @invoice_request.open?
      Billing::InvoiceSettlement.mark_paid(@invoice_request, by: Current.user)
      done t("invoicing.admin.flash.paid")
    rescue Providers::StripeGateway::Error => e
      stripe_refused(e)
    end

    def cancel
      return refuse(t("invoicing.admin.errors.closed")) unless @invoice_request.cancellable?
      Billing::InvoiceSettlement.cancel(@invoice_request, by: Current.user)
      done t("invoicing.admin.flash.cancelled")
    rescue Providers::StripeGateway::Error => e
      stripe_refused(e)
    end

    # « Activer la formule »: for 12 months from the date typed (default: today).
    def activate
      starts_at = start_time
      return refuse(t("invoicing.admin.errors.invalid_date")) if starts_at == :invalid
      grant = @invoice_request.activate!(starts_at:, by: Current.user)
      done t("invoicing.admin.flash.activated", plan: @invoice_request.plan_name,
        start: Billing::FrenchDate.long(grant.starts_at), end: Billing::FrenchDate.long(grant.ends_at))
    rescue InvoiceRequest::Closed
      refuse t("invoicing.admin.errors.closed")
    end

    private
      def require_admin!
        head :not_found unless Current.user&.admin?
      end

      def set_invoice_request
        @invoice_request = InvoiceRequest.find(params[:id])
      end

      # nil (the default start), a time, or :invalid.
      def start_time
        value = params[:starts_on].to_s.strip
        return nil if value.empty?
        Date.iso8601(value).in_time_zone
      rescue Date::Error
        :invalid
      end

      def done(message)
        redirect_back_or_to admin_invoice_requests_path, notice: message, status: :see_other
      end

      def refuse(message)
        redirect_back_or_to admin_invoice_requests_path, alert: message, status: :see_other
      end

      def stripe_refused(error)
        Rails.error.report(error, handled: true)
        refuse t("invoicing.admin.errors.stripe", message: error.message)
      end

      def counts
        by_status = InvoiceRequest.group(:status).count
        { open: by_status["requested"].to_i + by_status["invoiced"].to_i, paid: by_status["paid"].to_i,
          cancelled: by_status["cancelled"].to_i, all: by_status.values.sum }
      end
  end
end
