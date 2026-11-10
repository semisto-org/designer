# What the « Noter du temps » form needs, wherever it shows (« Mes heures »,
# a project's « Temps et dépenses »): the projects the person may log time
# on, each with its likely phase, recipient and usual trip, and the
# recipients they already bill.
module TimeEntryForms
  extend ActiveSupport::Concern

  private
    def time_entry_choice(map, user = Current.user)
      {
        id: map.id, name: map.name, teamName: map.organization&.name,
        defaultPhase: TimeEntry.default_phase(map, user),
        billTo: TimeEntry.default_bill_to(map, user),
        usualTrip: TimeEntry.usual_trip(map, user)
      }
    end

    def bill_to_suggestions(user = Current.user)
      (user.time_entries.where.not(bill_to: nil).distinct.pluck(:bill_to) + user.organizations.pluck(:name)).uniq.sort
    end

    def time_entry_catalog
      { phases: TimeEntry::PHASES, reasons: TimeEntry::NON_BILLABLE_REASONS, stepMinutes: TimeEntry::STEP_MINUTES }
    end

    def time_entry_params
      params.require(:time_entry).permit(:worked_on, :minutes, :phase, :billable, :non_billable_reason, :note, :bill_to, :trip_km, :trip_from, :trip_to)
    end
end
