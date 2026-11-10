class TimeEntry
  # « Relevé de prestations »: what a designer worked for one recipient
  # (Semisto, another structure) over a period, to attach to the invoice
  # they make in their own tool (sent over Peppol in Belgium). Never an
  # invoice itself: hours and kilometres, no rate, no VAT, « document non
  # fiscal ». Lists the billable hours not invoiced yet, project by project
  # and phase by phase; the non-billable ones of the same period are shown
  # apart, for the record.
  class Statement
    attr_reader :user, :bill_to, :from, :to

    def initialize(user:, bill_to:, from: nil, to: nil)
      @user = user
      @bill_to = bill_to.to_s.strip.presence
      @from = from
      @to = to
    end

    def scope
      entries = user.time_entries.not_invoiced.where(bill_to:).includes(:map)
      entries = entries.where(worked_on: from..) if from
      entries = entries.where(worked_on: ..to) if to
      entries.chronological
    end

    def entries = @entries ||= scope.to_a
    def billable = entries.select(&:billable?)
    def non_billable = entries.reject(&:billable?)

    def projects
      billable.group_by(&:map).map do |map, lines|
        {
          mapId: map.id, name: map.name, client: client_of(map),
          offer: TimeEntry::Envelopes.accepted_version(map)&.label,
          minutes: lines.sum(&:minutes), km: lines.sum { _1.trip_km.to_f }.round(1),
          phases: lines.group_by(&:phase).sort_by { TimeEntry::PHASES.index(_1.first) }.map { |phase, mine| { phase:, minutes: mine.sum(&:minutes) } },
          entries: lines.map(&:as_json)
        }
      end.sort_by { _1[:name].downcase }
    end

    def trips = billable.select(&:trip_km).map(&:as_json)

    # Marks every billable entry of the statement as invoiced, at once.
    def invoice!(number:, at: Time.current)
      ids = billable.map(&:id)
      TimeEntry.where(id: ids).update_all(invoiced_at: at, invoice_number: number.to_s.strip.presence, updated_at: at)
      ids.size
    end

    def period
      dates = entries.map(&:worked_on)
      { from: (from || dates.min)&.iso8601, to: (to || dates.max)&.iso8601 }
    end

    def as_json(*)
      lines = billable
      {
        designer: { name: user.display_name, email: user.email_address }, billTo: bill_to, period:,
        projects:, trips:,
        totals: { minutes: lines.sum(&:minutes), km: lines.sum { _1.trip_km.to_f }.round(1), entries: lines.size },
        nonBillable: non_billable.map(&:as_json),
        generatedOn: Date.current.iso8601
      }
    end

    private
      # The person who carries the project (the project sheet's lead), as on the offer.
      def client_of(map)
        Array(map.project_sheet.section("who")["people"]).find { _1["role"] == "lead" }&.dig("name")
      end
  end
end
