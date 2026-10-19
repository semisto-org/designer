module DronePilots
  # What the directory and a pilot's page show of a pilot: never their legal
  # details, phone or exact base (only the place they named), and, for one
  # of the client's maps, the distance, whether they fly there and the price.
  module Directory
    module_function

    def card(pilot, map: nil)
      distance = pilot.distance_km_to(map)
      {
        id: pilot.id,
        name: pilot.display_name,
        avatarUrl: pilot.user.avatar_url,
        bio: pilot.bio,
        basePlace: pilot.base_place,
        radiusKm: pilot.service_radius_km,
        drones: pilot.drones.map { |drone| { model: drone["model"], name: drone["name"].presence } },
        features: pilot.features,
        dataTypes: pilot.data_types,
        certificates: pilot.certificates,
        priceCents: pilot.mission_price_cents,
        travelFeesEnabled: pilot.travel_fees_enabled,
        missionsDone: pilot.missions.where(status: "completed").count,
        distanceKm: distance&.round,
        serves: map ? pilot.serves?(map) : nil,
        quote: (pilot.quote_for(map).as_json if map && distance)
      }
    end

    # The client's maps a mission can be booked on: they edit it and it has a place.
    def bookable_maps(user)
      return [] unless user
      user.openable_maps.where.not(center: nil).order(:name).select { _1.editable_by?(user) }
    end

    def map_option(map) = { id: map.id, name: map.name, address: map.address }
  end
end
