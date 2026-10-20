# The accounts and places the monthly journeys (script/journeys.mjs,
# docs/quality/) are lived on, one set per device so the computer and the
# phone each start from the same state:
#
#   premiere-carte-<device>@journeys.test  a person who has never signed in
#   jardinier-<device>@journeys.test       a free account with one garden near
#                                          Purnode, at its plan's limit of maps
#   retour-<device>@journeys.test          a garden planted three months ago
#                                          and not opened since
#   invite-<device>@journeys.test          invited to the gardener's map
#
# Writes the ids the script needs to tmp/journeys/ids.json, or OUT (and
# prints them).
# Development and test only.
namespace :journeys do
  desc "Reset the accounts and maps the monthly journeys are lived on"
  task prepare: :environment do
    abort "Development or test only" unless Rails.env.local?

    devices = %w[desktop phone]
    factory = RGeo::Geos.factory(srid: 4326)
    point = ->(lng, lat) { factory.point(lng, lat) }
    rectangle = lambda do |lng, lat, width, height|
      ring = [ [ lng, lat ], [ lng + width, lat ], [ lng + width, lat + height ], [ lng, lat + height ], [ lng, lat ] ]
      factory.polygon(factory.linear_ring(ring.map { |x, y| point.(x, y) }))
    end
    species = PlantSpecies.order(:id).limit(12).to_a
    abort "No plant species: run bin/rails db:seed first" if species.empty?

    # Every run starts over: the journeys create maps, invitations and comments.
    emails = devices.product(%w[premiere-carte jardinier retour invite voisine]).map { |device, name| "#{name}-#{device}@journeys.test" }
    User.where(email_address: emails).find_each do |user|
      Map.where(owner: user).destroy_all
      Comment.where(author: user).destroy_all
      user.reload.destroy!
    end
    MapInvitation.where(email_address: emails).delete_all

    garden = lambda do |owner, name, lng, lat, planted_on|
      map = Map.create!(name:, owner:, zoom: 19, center: point.(lng, lat), address: "Purnode, Yvoir",
                        boundary: factory.multi_polygon([ rectangle.(lng - 0.0006, lat - 0.0004, 0.0012, 0.0008) ]))
      map.features.create!(layer: "water", kind: "pond", name: "Mare", geometry: rectangle.(lng - 0.0004, lat - 0.0002, 0.00012, 0.00008))
      map.features.create!(layer: "structures", kind: "zone", name: "Lisière nord", geometry: rectangle.(lng - 0.0005, lat + 0.0001, 0.001, 0.0002))
      species.each_with_index do |plant, i|
        properties = { "species_id" => plant.id }
        properties["planted_on"] = planted_on.iso8601 if planted_on
        map.features.create!(layer: "plants", kind: "plant", properties:,
                             geometry: point.(lng - 0.0004 + (i % 6) * 0.00015, lat + 0.00005 + (i / 6) * 0.0001))
      end
      map
    end

    back = 3.months.ago
    ids = devices.to_h do |device|
      gardener = User.create!(email_address: "jardinier-#{device}@journeys.test", name: "Camille", account_kind: "individual", tour_seen_at: Time.current)
      map = garden.(gardener, "Le jardin de Purnode", 4.9418, 50.3062, nil)
      invitation = map.invitations.create!(email_address: "invite-#{device}@journeys.test", role: "editor", invited_by: gardener)
      invitation.update_column(:token, "journeys-invitation-#{device}")

      returning = User.create!(email_address: "retour-#{device}@journeys.test", name: "Dominique", account_kind: "individual", tour_seen_at: back)
      return_map = garden.(returning, "Le verger du retour", 4.9441, 50.3049, back.to_date)
      return_map.features.update_all(created_at: back, updated_at: back)
      return_map.update_columns(created_at: back, updated_at: back)

      [ device, { map: map.id, plant: map.features.where(layer: "plants").order(:id).pick(:id),
                  return_map: return_map.id, invitation: "/invitations/#{invitation.token}" } ]
    end

    path = Pathname(ENV.fetch("OUT") { Rails.root.join("tmp/journeys/ids.json") })
    FileUtils.mkdir_p(path.dirname)
    File.write(path, JSON.pretty_generate(ids))
    puts JSON.generate(ids)
  end
end
