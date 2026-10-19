module Mcp
  module Tools
    # The drone missions booked on a map in the pilot directory: who flies,
    # what was asked, where the mission stands, and what the pilot already
    # delivered (drone views on the map, photos, files to download). Editors
    # only: a mission carries a price and a conversation.
    class ListDroneMissions < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        require_editor!
        missions = map.drone_missions.includes(:client, drone_pilot: :user).order(created_at: :desc).limit(50)
        { missions: missions.map { mission_json(_1) }, statuses: DroneMission::STATUSES }
      end

      private
        def mission_json(mission)
          {
            id: mission.id, status: mission.status, disputed: mission.disputed?,
            pilot: { id: mission.drone_pilot_id, name: mission.drone_pilot.display_name },
            client: mission.client.display_name,
            dataTypes: mission.data_types, desiredPeriod: mission.desired_period, message: mission.message,
            pilotReply: mission.pilot_reply, flightOn: mission.flight_on&.iso8601, deliveryNote: mission.delivery_note,
            quote: mission.quote.as_json,
            createdAt: mission.created_at.iso8601, paidAt: mission.paid_at&.iso8601, deliveredAt: mission.delivered_at&.iso8601,
            delivered: {
              views: mission.aerial_views.newest_first.map { { id: _1.id, name: _1.name, product: _1.product, capturedOn: _1.captured_on.iso8601, status: _1.status } },
              photos: mission.photos.count,
              files: mission.files.includes(:blob).map { { filename: _1.filename.to_s, byteSize: _1.byte_size } }
            },
            url: "#{origin}/missions-drone/#{mission.id}"
          }
        end

        def summarize_result(data) = { missions: data[:missions].size }
    end
  end
end
