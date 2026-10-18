# The visits of a map (SiteVisit). Everyone on the map reads them; an editor
# closes one from the phone: POST with the visit's key (the phone made it),
# when it began and ended, and the questions to turn into tasks. Posting the
# same key again closes the same visit (a lost answer, a second phone).
module Maps
  class SiteVisitsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, only: :create

    def index
      render json: { visits: @map.site_visits.includes(:user).reverse.map(&:as_json) }
    end

    def create
      raw = params.require(:site_visit)
      visit = @map.site_visits.create_with(user: Current.user, started_at: time(raw[:started_at]) || Time.current)
        .find_or_create_by!(key: raw.require(:key).to_s)
      visit.close!(ended_at: time(raw[:ended_at]) || Time.current, started_at: time(raw[:started_at]),
                   question_ids: Array(raw[:question_ids]), by: Current.user)
      render json: { visit: visit.as_json, documentUrl: visit.map_document && map_document_url(@map, visit.map_document) }, status: :created
    rescue ActiveRecord::RecordInvalid => error
      render_errors error.record
    rescue ActiveRecord::RecordNotUnique
      retry
    end

    private
      # A time from the phone, never in the future (a phone's clock may be off).
      def time(value)
        parsed = Time.zone.parse(value.to_s) if value.present?
        parsed && [ parsed, Time.current ].min
      rescue ArgumentError
        nil
      end
  end
end
