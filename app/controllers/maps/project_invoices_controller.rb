# « Budget du projet »: the invoices the team sent its client, recorded with
# their amount split over the four budget items and their PDF. Only the team
# that runs the project (ProjectInvoice.writable_by?) records, changes or
# removes them; the PDF comes back through #document, for that team only.
module Maps
  class ProjectInvoicesController < ApplicationController
    include MapScoped
    include ActiveStorage::SetCurrent
    include ProjectInvoiceParams

    before_action :set_map
    before_action :require_team!, except: :document
    before_action :require_reader!, only: :document
    before_action :set_invoice, only: %i[update destroy document]

    def create
      invoice = @map.project_invoices.new(invoice_params.merge(user: Current.user, source: "web"))
      if invoice.save
        render json: { invoice: json(invoice) }, status: :created
      else
        render_errors invoice
      end
    end

    def update
      @invoice.assign_attributes(invoice_params)
      @invoice.document.detach if params.dig(:invoice, :remove_document) == "true" && !invoice_params.key?(:document)
      if @invoice.save
        render json: { invoice: json(@invoice) }
      else
        render_errors @invoice
      end
    end

    def destroy
      @invoice.destroy!
      head :no_content
    end

    # A short-lived link to the invoice's PDF (or its photo).
    def document
      return head :not_found unless @invoice.document.attached?
      expires_in 4.minutes, private: true
      redirect_to stored_file_url(@invoice.document, expires_in: 5.minutes), allow_other_host: true
    end

    private
      def require_team!
        forbid! unless ProjectInvoice.writable_by?(@map, Current.user)
      end

      # Reading the PDF stays open on a read-only or archived map.
      def require_reader!
        forbid! unless TimeEntry.usable_by?(@map, Current.user)
      end

      def forbid!
        render json: { message: t("time_entries.errors.no_access") }, status: :forbidden
      end

      def set_invoice
        @invoice = @map.project_invoices.find(params[:id])
      end

      def json(invoice)
        invoice.as_json(document_url: invoice.document.attached? ? document_map_project_invoice_path(@map, invoice) : nil)
      end

      def invoice_params
        raw = params.require(:invoice).permit(:number, :issued_on, :paid_on, :vat, :note, :document, items: ProjectInvoice::ITEMS)
        attributes = raw.slice(:number, :issued_on, :paid_on, :note).to_h
        attributes[:paid_on] = attributes[:paid_on].presence if attributes.key?(:paid_on)
        ProjectInvoice::ITEMS.each { |item| attributes[:"#{item}_cents"] = cents(raw[:items][item]) || 0 if raw[:items]&.key?(item) }
        attributes[:vat_cents] = cents(raw[:vat]) || 0 if raw.key?(:vat)
        attributes[:document] = raw[:document] if raw[:document].present?
        attributes
      end
  end
end
