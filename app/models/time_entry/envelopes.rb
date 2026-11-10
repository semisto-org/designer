class TimeEntry
  # Where a project stands, phase by phase: the hours and kilometres of the
  # accepted offer (its last version marked « acceptée ») against what the
  # team noted. One envelope per phase, shared by everyone on it (Michael,
  # 2026-11-10). « commercial » has no envelope: it is the time before the
  # offer was accepted. Going over is computed here, never chosen by the
  # designer.
  class Envelopes
    def self.accepted_version(map)
      offer = map.offer
      offer && offer.versions.where(status: "accepted").reorder(number: :desc).first
    end

    attr_reader :map, :entries

    def initialize(map, entries: map.time_entries.includes(:user).to_a)
      @map = map
      @entries = entries
    end

    def version = defined?(@version) ? @version : (@version = self.class.accepted_version(map))

    def phases
      TimeEntry::PHASES.map do |key|
        noted = entries.select { _1.phase == key }
        budget = budget_for(key)
        minutes = noted.sum(&:minutes)
        billable = noted.select(&:billable?).sum(&:minutes)
        envelope_minutes = budget && (budget[:hours] * 60).round
        {
          key:, enabledInOffer: budget ? budget[:enabled] : nil,
          envelopeHours: budget&.dig(:hours), envelopeKm: budget&.dig(:km),
          hours: hours(minutes), billableHours: hours(billable), nonBillableHours: hours(minutes - billable),
          invoicedHours: hours(noted.select(&:invoiced?).sum(&:minutes)),
          km: noted.sum { _1.trip_km.to_f }.round(1),
          overHours: envelope_minutes && minutes > envelope_minutes ? hours(minutes - envelope_minutes) : nil,
          usedPct: envelope_minutes&.positive? ? (minutes * 100.0 / envelope_minutes).round : nil
        }
      end
    end

    def totals
      list = phases
      envelope = list.sum { _1[:envelopeHours].to_f }
      {
        hours: list.sum { _1[:hours] }.round(2), billableHours: list.sum { _1[:billableHours] }.round(2),
        nonBillableHours: list.sum { _1[:nonBillableHours] }.round(2),
        km: list.sum { _1[:km] }.round(1),
        envelopeHours: version ? envelope.round(2) : nil,
        envelopeKm: version ? list.sum { _1[:envelopeKm].to_f }.round(1) : nil
      }
    end

    # Hours and km per person and phase: the team's table (never the client's).
    def people
      entries.group_by(&:user).map do |user, mine|
        {
          userId: user.id, name: user.display_name,
          hours: hours(mine.sum(&:minutes)), billableHours: hours(mine.select(&:billable?).sum(&:minutes)),
          km: mine.sum { _1.trip_km.to_f }.round(1), trips: mine.count { _1.trip_km },
          byPhase: TimeEntry::PHASES.index_with { |key| hours(mine.select { _1.phase == key }.sum(&:minutes)) }
        }
      end.sort_by { -_1[:hours] }
    end

    def version_json
      version && { number: version.number, label: version.label, createdAt: version.created_at.iso8601 }
    end

    def as_json(*)
      { version: version_json, phases:, totals:, people: }
    end

    private
      def hours(minutes) = (minutes / 60.0).round(2)

      # The accepted version's hours (without options: what the client
      # agreed to as the base) and the kilometres of its trips.
      def budget_for(key)
        return nil unless version && key != "commercial"
        phase = Array(version.result["phases"]).find { _1["key"] == key }
        return nil unless phase
        km = Array(phase["expenses"]).select { _1["kind"] == "trip" }.sum { _1["km"].to_f }
        { hours: phase["hours_min"].to_f, km: km.round(1), enabled: phase["enabled"] != false }
      end
  end
end
