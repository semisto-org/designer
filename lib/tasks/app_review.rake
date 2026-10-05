# The app stores' reviewers' account (AppReview): created with a small demo
# map, or added as editor of an existing map (MAP_ID=…). Run once on the
# server after setting APP_REVIEW_EMAIL and APP_REVIEW_CODE.
namespace :app_review do
  desc "Prepare the stores' review account: bin/rails app_review:prepare [MAP_ID=…]"
  task prepare: :environment do
    abort "Set APP_REVIEW_EMAIL and APP_REVIEW_CODE (#{AppReview::MIN_CODE_LENGTH}+ characters) first." unless AppReview.enabled?
    user = AppReview.user

    if ENV["MAP_ID"].present?
      map = Map.find(ENV["MAP_ID"])
      membership = map.memberships.find_or_initialize_by(user:)
      membership.update!(role: "editor") unless membership.role.in?(%w[owner editor])
      puts "#{user.email_address} edits « #{map.name} » (map #{map.id})"
      next
    end

    map = user.owned_maps.find_or_create_by!(name: "Jardin-forêt de démonstration") do |m|
      m.boundary = { type: "MultiPolygon", coordinates: [ [ [ [ 4.8800, 50.3300 ], [ 4.8809, 50.3300 ], [ 4.8809, 50.3304 ], [ 4.8800, 50.3304 ], [ 4.8800, 50.3300 ] ] ] ] }
    end
    if map.features.none?
      species = PlantSpecies.order(:id).limit(3).to_a
      [ [ 4.8803, 50.3302, true ], [ 4.8805, 50.3302, false ], [ 4.8807, 50.3303, false ] ].each_with_index do |(lng, lat, planted), index|
        properties = {}
        properties["species_id"] = species[index].id if species[index]
        properties["planted_on"] = Date.current.iso8601 if planted
        map.features.create!(layer: "plants", kind: PlantableFeature::PLANT, properties:, created_by: user,
          geometry: { type: "Point", coordinates: [ lng, lat ] })
      end
      map.features.create!(layer: "notes", kind: "note_point", name: "Zone humide au printemps", created_by: user,
        geometry: { type: "Point", coordinates: [ 4.8801, 50.3303 ] })
    end
    puts "#{user.email_address} owns « #{map.name} » (map #{map.id}, #{map.features.count} elements)"
  end
end
