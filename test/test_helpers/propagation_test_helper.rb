# A shared place for the propagation tests: Michael owns the place of the
# Ahinvaux map and shows a 'Reinette grise' apple in the ground since 2019;
# Bob gardens his own map about 60 km away.
module PropagationTestHelper
  def share_place!(map = maps(:ahinvaux), requests: true)
    map.memberships.find_by(user: map.owner).update!(place_owner: true)
    map.update!(shares_planted_palette: true, accepts_propagation_requests: requests)
    map
  end

  def plant_in_ground!(map, species, variety: nil, planted_on: "2019-03-15", **properties)
    map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.906, lat: 50.341),
                         properties: { "species_id" => species.id, "variety_id" => variety&.id, "planted_on" => planted_on }.merge(properties.transform_keys(&:to_s)).compact)
  end

  def gardener_with_map(user = users(:bob))
    Map.create!(name: "Jardin de Bob", owner: user, region: regions(:wallonia), center: "SRID=4326;POINT(4.4 50.8)")
    user
  end
end

ActiveSupport::TestCase.include PropagationTestHelper
ActionDispatch::IntegrationTest.include PropagationTestHelper
