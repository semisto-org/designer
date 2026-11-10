# The « relevé de prestations » of one recipient: the billable hours and
# trips I have not invoiced yet, on a printable A4 page (the browser saves
# it as PDF), to attach to the invoice I make in my own tool. Then « Marquer
# comme facturé » with my invoice number locks them; taking an invoice back
# (destroy, by its number) unlocks them, for a slip.
module TimeEntries
  class StatementsController < ApplicationController
    def show
      render inertia: "time_entries/statement", props: { statement: statement.as_json, filters: filters }
    end

    def create
      number = params[:invoice_number].to_s.strip
      return render(json: { message: t("time_entries.errors.invoice_number") }, status: :unprocessable_content) if number.blank? || number.length > 60
      count = statement.invoice!(number:)
      render json: { invoiced: count }
    end

    def destroy
      entries = Current.user.time_entries.invoiced.where(bill_to: params[:bill_to].presence, invoice_number: params[:invoice_number].presence)
      count = entries.update_all(invoiced_at: nil, invoice_number: nil, updated_at: Time.current)
      render json: { reopened: count }
    end

    private
      def statement
        @statement ||= TimeEntry::Statement.new(user: Current.user, bill_to: params[:bill_to], from: date(:from), to: date(:to))
      end

      def filters = { billTo: params[:bill_to].presence, from: date(:from)&.iso8601, to: date(:to)&.iso8601 }

      def date(key)
        Date.iso8601(params[key].to_s)
      rescue Date::Error
        nil
      end
  end
end
