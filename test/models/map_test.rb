require "test_helper"

class MapTest < ActiveSupport::TestCase
  test "owner gets an owner membership and the area is computed from the boundary" do
    map = Map.create!(name: "Test", owner: users(:bob), region: regions(:wallonia), boundary: square(size: 0.001))
    assert_equal "owner", map.role_for(users(:bob))
    assert_in_delta 7_900, map.reload.area_m2, 400
    assert map.center.present?
  end

  test "roles" do
    map = maps(:ahinvaux)
    assert map.editable_by?(users(:michael))
    assert map.viewable_by?(users(:alice))
    assert_not map.editable_by?(users(:alice))
    assert_not map.viewable_by?(users(:bob))
  end

  test "at most three editors" do
    map = maps(:ahinvaux)
    3.times { |i| map.memberships.create!(user: User.create!(email_address: "e#{i}@example.org"), role: "editor") }
    extra = map.memberships.new(user: users(:bob), role: "editor")
    assert_not extra.valid?
    assert extra.errors.added?(:role, :editor_limit, count: 3)
  end
end
