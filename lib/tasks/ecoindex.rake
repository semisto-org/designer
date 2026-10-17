# The demo the « EcoIndex » workflow measures the signed-in screens on: an
# account that has chosen its kind and seen the tour (so neither the welcome
# page nor the carnet de route opens), and a garden of 150 plants and 10
# zones near Yvoir. Development and test only.
namespace :ecoindex do
  desc "Create the EcoIndex demo account and map; prints MAP_ID and PLANT_ID"
  task demo: :environment do
    abort "Development or test only" unless Rails.env.local?
    user = User.find_or_create_by!(email_address: "ecoindex@semisto.org") { |u| u.name = "EcoIndex" }
    user.update!(account_kind: "individual", tour_seen_at: Time.current)
    factory = RGeo::Geos.factory(srid: 4326)
    lng, lat, half = 4.9245, 50.3255, 0.0015
    square = ->(x, y, side) { factory.polygon(factory.linear_ring([ [ x, y ], [ x + side, y ], [ x + side, y + side ], [ x, y + side ], [ x, y ] ].map { |a, b| factory.point(a, b) })) }
    map = user.owned_maps.find_by(name: "Jardin-forêt EcoIndex") ||
      Map.create!(name: "Jardin-forêt EcoIndex", owner: user, zoom: 18, center: factory.point(lng, lat),
                  boundary: factory.multi_polygon([ square.(lng - half, lat - half, 2 * half) ]))
    if map.features.none?
      random = Random.new(1)
      species = PlantSpecies.order(:id).limit(40).pluck(:id)
      spot = -> { [ lng - half + random.rand * 2 * half, lat - half + random.rand * 2 * half ] }
      150.times { map.features.create!(layer: "plants", kind: "plant", geometry: factory.point(*spot.()), properties: { "species_id" => species.sample(random:) }) }
      10.times { |i| map.features.create!(layer: "structures", kind: "zone", name: "Zone #{i + 1}", geometry: square.(*spot.(), 0.0002)) }
    end
    puts "MAP_ID=#{map.id}"
    puts "PLANT_ID=#{PlantSpecies.order(:id).first&.to_param}"
  end
end
