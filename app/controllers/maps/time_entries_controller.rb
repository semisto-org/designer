# A project's « Temps et dépenses »: where each phase stands against the
# accepted offer (TimeEntry::Envelopes), the hours and trips of everyone on
# it, and a form to note one's own. For the team that runs the project
# (TimeEntry.shown_to?): never for its viewers, often the client. Without a
# Pro or Team plan, the page says what it would bring (PlanGate).
module Maps
  class TimeEntriesController < ApplicationController
    include MapScoped
    include TimeEntryForms

    before_action :set_map
    before_action :require_shown!

    def index
      usable = TimeEntry.enabled_for?(@map)
      props = {
        map: { id: @map.id, name: @map.name, role: @role, teamId: @map.organization_id, offerBuilder: Offer.shown_to?(@map, Current.user) },
        place: { id: @map.id, name: @map.name, boundary: @map.geometry_geojson(:boundary), areaM2: @map.area_m2 },
        canUse: usable, canUpgrade: @map.billing_user == Current.user
      }
      return render(inertia: "maps/time_entries/index", props:) unless usable
      entries = @map.time_entries.includes(:user).order(worked_on: :desc, id: :desc).to_a
      render inertia: "maps/time_entries/index", props: props.merge(
        canWrite: !@map.read_only_by_plan? && !@map.archived?,
        envelopes: TimeEntry::Envelopes.new(@map, entries:).as_json,
        entries: entries.map(&:as_json),
        me: time_entry_choice(@map),
        billToSuggestions: bill_to_suggestions,
        catalog: time_entry_catalog,
        today: Date.current.iso8601
      )
    end

    private
      def require_shown!
        redirect_to map_path(@map) unless TimeEntry.shown_to?(@map, Current.user)
      end
  end
end
