# The visits of a map (SiteVisit). Everyone on the map reads them; an editor
# closes one from the phone: POST with the visit's key (the phone made it),
# when it began and ended, the questions to turn into tasks and, when the
# phone recorded it, the walk's GPS track. Posting the same key again closes
# the same visit (a lost answer, a second phone). The audio recording of the
# walk comes on its own (POST …/site_visits/:key/audio, multipart), before
# the visit closes, so that the report can point to it.
module Maps
  class SiteVisitsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, only: %i[create audio]

    def index
      render json: { visits: @map.site_visits.includes(:user).reverse.map(&:as_json) }
    end

    def create
      raw = params.require(:site_visit)
      visit = @map.site_visits.create_with(user: Current.user, started_at: time(raw[:started_at]) || Time.current)
        .find_or_create_by!(key: raw.require(:key).to_s)
      visit.close!(ended_at: time(raw[:ended_at]) || Time.current, started_at: time(raw[:started_at]),
                   question_ids: Array(raw[:question_ids]), track: track(raw), by: Current.user)
      render json: { visit: visit.as_json, documentUrl: visit.map_document && map_document_url(@map, visit.map_document) }, status: :created
    rescue ActiveRecord::RecordInvalid => error
      render_errors error.record
    rescue ActiveRecord::RecordNotUnique
      retry
    end

    def audio
      raw = params.require(:site_visit)
      upload = raw.require(:audio)
      return render(json: { message: t("site_visits.errors.no_audio") }, status: :unprocessable_entity) unless upload.respond_to?(:tempfile)
      visit = @map.site_visits.create_with(user: Current.user, started_at: time(raw[:started_at]) || Time.current)
        .find_or_create_by!(key: params[:key].to_s)
      document = visit.attach_audio!(upload, seconds: raw[:seconds].presence&.to_i, by: Current.user)
      render json: { visit: visit.as_json, documentId: document.id, documentUrl: map_document_url(@map, document) }, status: :created
    rescue ActiveRecord::RecordInvalid => error
      render_errors error.record
    rescue ActiveRecord::RecordNotUnique
      retry
    end

    private
      # [[lng, lat], …] as JSON, or as an array of pairs.
      def track(raw)
        value = raw[:track]
        value = JSON.parse(value) if value.is_a?(String)
        Array(value).map { |pair| Array(pair) }
      rescue JSON::ParserError
        nil
      end

      # A time from the phone, never in the future (a phone's clock may be off).
      def time(value)
        parsed = Time.zone.parse(value.to_s) if value.present?
        parsed && [ parsed, Time.current ].min
      rescue ArgumentError
        nil
      end
  end
end
