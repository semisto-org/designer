# « Mes heures »: the hours and trips I noted on every project, month by
# month, and what I still have to invoice, recipient by recipient (each
# one opens its « relevé de prestations », TimeEntries::StatementsController).
# Writes come here from every form (this page, a project's tab, the phone):
# one entry at a time, always the signed-in person's own, never once
# invoiced.
class TimeEntriesController < ApplicationController
  include TimeEntryForms

  before_action :set_entry, only: %i[update destroy]
  before_action :require_not_invoiced!, only: %i[update destroy]

  def index
    month = month_param
    entries = Current.user.time_entries.where(worked_on: month.all_month).includes(:map, :user).order(worked_on: :desc, id: :desc)
    maps = TimeEntry.maps_for(Current.user)
    render inertia: "time_entries/index", props: {
      month: month.strftime("%Y-%m"), today: Date.current.iso8601,
      entries: entries.map { _1.as_json.merge(mapName: _1.map.name) },
      monthTotals: { minutes: entries.sum(&:minutes), billableMinutes: entries.select(&:billable?).sum(&:minutes), km: entries.sum { _1.trip_km.to_f }.round(1) },
      toInvoice: to_invoice,
      invoiced: recent_invoices,
      maps: maps.map { time_entry_choice(_1) },
      billToSuggestions: bill_to_suggestions,
      catalog: time_entry_catalog
    }
  end

  def create
    map = Map.active.find_by(id: params.dig(:time_entry, :map_id))
    return deny unless map && writable?(map)
    entry = Current.user.time_entries.new(time_entry_params.merge(map:, source: source_param))
    entry.bill_to ||= TimeEntry.default_bill_to(map, Current.user) unless time_entry_params.key?(:bill_to)
    if entry.save
      render json: { entry: entry.as_json }, status: :created
    else
      render_errors entry
    end
  end

  def update
    attributes = time_entry_params
    if (map_id = params.dig(:time_entry, :map_id)).present? && map_id.to_i != @entry.map_id
      map = Map.active.find_by(id: map_id)
      return deny unless map && writable?(map)
      @entry.map = map
    end
    return deny unless writable?(@entry.map)
    if @entry.update(attributes)
      render json: { entry: @entry.as_json }
    else
      render_errors @entry
    end
  end

  def destroy
    @entry.destroy!
    head :no_content
  end

  private
    def set_entry
      @entry = Current.user.time_entries.find(params[:id])
    end

    def require_not_invoiced!
      render json: { message: t("time_entries.errors.invoiced") }, status: :unprocessable_content if @entry.invoiced?
    end

    def writable?(map) = TimeEntry.usable_by?(map, Current.user) && !map.read_only_by_plan?

    def deny
      render json: { message: t("time_entries.errors.no_access") }, status: :forbidden
    end

    def source_param = params[:source] == "app" ? "app" : "web"

    def month_param
      Date.strptime(params[:month].to_s, "%Y-%m")
    rescue Date::Error
      Date.current.beginning_of_month
    end

    # What is noted and billable but not invoiced yet, per recipient.
    def to_invoice
      Current.user.time_entries.to_invoice.group_by(&:bill_to).map do |bill_to, entries|
        dates = entries.map(&:worked_on)
        { billTo: bill_to, minutes: entries.sum(&:minutes), km: entries.sum { _1.trip_km.to_f }.round(1),
          entries: entries.size, projects: entries.map(&:map_id).uniq.size, from: dates.min.iso8601, to: dates.max.iso8601 }
      end.sort_by { _1[:billTo].to_s.downcase }
    end

    # The last invoices noted, to take one back if it was a slip.
    def recent_invoices
      Current.user.time_entries.invoiced.where(invoiced_at: 6.months.ago..)
             .group(:bill_to, :invoice_number).pluck(:bill_to, :invoice_number, Arel.sql("MAX(invoiced_at)"), Arel.sql("SUM(minutes)"), Arel.sql("COUNT(*)"))
             .map { |bill_to, number, at, minutes, count| { billTo: bill_to, invoiceNumber: number, invoicedAt: at.iso8601, minutes:, entries: count } }
             .sort_by { _1[:invoicedAt] }.reverse.first(12)
    end
end
