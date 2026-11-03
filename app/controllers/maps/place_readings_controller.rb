# GET /maps/:map_id/place_reading — « Voici ton lieu »: what Terranova reads
# of the place on its own (slope, where water runs, size), for anyone who
# sees the map, with the three missions outside (Maps::FirstHourMissions)
# and a QR code that carries them to the phone. PATCH — the page was read:
# the map's first hour has started, and the page no longer opens by itself
# (editors).
module Maps
  class PlaceReadingsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, only: :update
    rate_limit to: 30, within: 1.minute, only: :show, with: -> { head :too_many_requests }

    def show
      render json: {
        reading: PlaceReading.new(@map).call, relief: Providers::Elevation.available?(@map.region),
        missions: FirstHourMissions.new(@map).as_json, phone: phone
      }
    end

    def update
      @map.update_column(:first_hour_started_at, Time.current) unless @map.first_hour_started_at
      render json: { firstHourStartedAt: @map.first_hour_started_at.iso8601 }
    end

    private
      # The map on the phone, with the missions open (the website on a phone;
      # the app shows them on its map too).
      def phone
        url = map_url(@map, missions: 1)
        { url:, qr: RQRCode::QRCode.new(url).as_svg(module_size: 4, color: "2b2420", shape_rendering: "crispEdges", use_path: true, viewbox: true, standalone: true) }
      end
  end
end
