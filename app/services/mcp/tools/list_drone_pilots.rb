module Mcp
  module Tools
    # The drone pilots of the directory (« Pilotes de drone ») who fly to a
    # map's place, nearest first, with their drones, what they deliver and
    # the price for this place (flat fee, travel, Semisto's share). Booking
    # and paying stay with the person, on the pilot's page (url).
    class ListDronePilots < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          data_types: { type: "array", items: { type: "string", enum: DroneCatalog::DATA_TYPES }, uniqueItems: true, description: :drone_data_types },
          include_out_of_range: { type: "boolean", description: :include_out_of_range }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, data_types: [], include_out_of_range: false)
        map = find_map!(map_id)
        raise ToolError, t("tools.list_drone_pilots.errors.not_located") if map.center.nil?
        pilots = DronePilot.listed.includes(:user).select { (data_types - _1.data_types).empty? }
        pilots = pilots.select { _1.serves?(map) } unless include_out_of_range
        cards = pilots.map { DronePilots::Directory.card(_1, map:).except(:avatarUrl).merge(url: "#{origin}/pilotes-drone/#{_1.id}?map_id=#{map.id}") }
        {
          map: { id: map.id, name: map.name, address: map.address },
          pilots: cards.sort_by { _1[:distanceKm] || Float::INFINITY },
          bookingOpen: Billing.enabled?,
          commissionPercent: (DroneMission::COMMISSION_RATE * 100).round,
          travelCentsPerKm: DronePilot::TRAVEL_CENTS_PER_KM,
          vocabulary: { dataTypes: DroneCatalog::DATA_TYPES, features: DroneCatalog::FEATURES, certificates: DroneCatalog::CERTIFICATES },
          directoryUrl: "#{origin}/pilotes-drone?map_id=#{map.id}"
        }
      end

      private
        def summarize_result(data) = { pilots: data[:pilots].size }
    end
  end
end
