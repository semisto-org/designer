# « Pilotes de drone »: the directory of approved pilots, to choose who will
# fly over one of my maps. With a map chosen (?map_id=), each pilot shows the
# distance, whether they fly there and the full price for that map. A
# pilot's page shows their fleet, what they bring back and the request form.
class DronePilotsController < ApplicationController
  def index
    maps = DronePilots::Directory.bookable_maps(Current.user)
    map = maps.find { _1.id.to_s == params[:map_id].to_s } || (maps.first if maps.one?)
    pilots = DronePilot.listed.includes(user: { avatar_attachment: :blob }).to_a
    render inertia: "drone_pilots/index", props: {
      pilots: pilots.map { DronePilots::Directory.card(_1, map:) },
      maps: maps.map { DronePilots::Directory.map_option(_1) },
      mapId: map&.id,
      myPilot: my_pilot_json,
      bookingOpen: Billing.enabled?
    }
  end

  def show
    pilot = DronePilot.listed.find_by(id: params[:id]) || (DronePilot.find_by(id: params[:id], user: Current.user))
    return redirect_to(drone_pilots_path, alert: t("drone_pilots.errors.not_listed")) unless pilot

    maps = DronePilots::Directory.bookable_maps(Current.user)
    map = maps.find { _1.id.to_s == params[:map_id].to_s } || maps.first
    render inertia: "drone_pilots/show", props: {
      pilot: DronePilots::Directory.card(pilot, map:),
      maps: maps.map { |m| DronePilots::Directory.map_option(m).merge(serves: pilot.serves?(m), distanceKm: pilot.distance_km_to(m)&.round, quote: pilot.quote_for(m).as_json) },
      mapId: map&.id,
      own: pilot.user_id == Current.user.id,
      bookingOpen: pilot.bookable?,
      waiting: Current.user.drone_missions.where(drone_pilot: pilot).open.newest_first.map { |m| { id: m.id, status: m.status, mapName: m.map.name } }
    }
  end

  private
    def my_pilot_json
      pilot = Current.user.drone_pilot
      pilot && { id: pilot.id, status: pilot.status, listed: pilot.listed? }
    end
end
