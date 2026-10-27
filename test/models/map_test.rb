require "test_helper"

class MapTest < ActiveSupport::TestCase
  test "owner gets an owner membership and the area is computed from the boundary" do
    map = Map.create!(name: "Test", owner: users(:bob), region: regions(:wallonia), boundary: square(size: 0.001))
    assert_equal "owner", map.role_for(users(:bob))
    assert_in_delta 7_900, map.reload.area_m2, 400
    assert map.center.present?
  end

  test "a new map without a name takes the name of its place, an existing one keeps needing a name" do
    map = Map.create!(name: " ", address: "Rue du Bois 3, 5530 Yvoir", owner: users(:bob), region: regions(:wallonia))
    assert_equal "Le terrain d'Yvoir", map.name
    assert_equal "Mon terrain", Map.create!(owner: users(:bob), region: regions(:wallonia)).name
    assert_not map.update(name: "")
  end

  test "the name a place gives a map" do
    assert_equal "Le terrain de Purnode", Map.name_for_address("Rue du Bois 3, 5530 Purnode")
    assert_equal "Le terrain d'Église", Map.name_for_address("Église")
    assert_equal "Mon terrain", Map.name_for_address(nil)
  end

  test "roles" do
    map = maps(:ahinvaux)
    assert map.editable_by?(users(:michael))
    assert map.viewable_by?(users(:alice))
    assert_not map.editable_by?(users(:alice))
    assert_not map.viewable_by?(users(:bob))
  end

  test "any number of editors" do
    map = maps(:ahinvaux)
    5.times { |i| map.memberships.create!(user: User.create!(email_address: "e#{i}@example.org"), role: "editor") }
    assert_equal 5, map.editors_count
    assert map.memberships.new(user: users(:bob), role: "editor").valid?
  end
end
