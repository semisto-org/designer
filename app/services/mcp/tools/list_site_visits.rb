module Mcp
  module Tools
    # The walks on the land made with the phone (SiteVisit): when, who, how
    # many notes, the report filed in the documents and, when the phone
    # recorded them, the audio of the walk (a document too) and its GPS
    # track. The report is read with get_document; the audio is not
    # transcribed yet, so the AI asks the person what was said.
    class ListSiteVisits < Base
      LIMIT = 30

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          include_tracks: { type: "boolean", default: false, description: :include_tracks }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, include_tracks: false)
        map = find_map!(map_id)
        visits = map.site_visits.includes(:user, :map_document, :audio_document).reorder(started_at: :desc, id: :desc).limit(LIMIT).to_a
        {
          visits: visits.map { |visit| visit_json(visit, include_tracks) },
          count: map.site_visits.count,
          documents_url: "#{map_url(map)}/documents"
        }
      end

      private
        def visit_json(visit, include_tracks)
          {
            key: visit.key, started_at: visit.started_at.iso8601, ended_at: visit.ended_at&.iso8601,
            by: visit.user&.display_name, notes: visit.notes.size,
            report: visit.map_document && { document_id: visit.map_document_id, title: visit.map_document.title },
            audio: visit.audio_document && {
              document_id: visit.audio_document_id, title: visit.audio_document.title, seconds: visit.audio_seconds,
              transcribed: false
            }.compact,
            track: visit.track && {
              length_m: visit.track_m, points: visit.track.num_points,
              geometry: (visit.geometry_geojson(:track) if include_tracks)
            }.compact
          }.compact
        end

        def summarize_result(data) = { visits: data[:visits].size }
    end
  end
end
