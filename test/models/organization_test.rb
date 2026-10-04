require "test_helper"
require_relative "../test_helpers/teams_test_helper"

class OrganizationTest < ActiveSupport::TestCase
  setup do
    @admin = users(:michael)
    @map = maps(:ahinvaux)
  end

  test "create_with_admin! makes the creator the first admin" do
    team = Organization.create_with_admin!(@admin, name: "  Bureau   d'études ")
    assert_equal "Bureau d'études", team.name
    assert_equal "admin", team.role_for(@admin)
    assert team.admin?(@admin)
    assert_not team.member?(users(:bob))
    assert_nil team.role_for(nil)
  end

  test "two teams may share a name: the slug gets a suffix" do
    first = Organization.create_with_admin!(@admin, name: "Semisto")
    second = Organization.create_with_admin!(users(:bob), name: "Semisto")
    assert_equal "semisto", first.slug
    assert_match(/\Asemisto-[a-z0-9]{6}\z/, second.slug)
    assert_equal "equipe", Organization.create!(name: "!!!").slug
  end

  test "the name is required and bounded" do
    assert_not Organization.new(name: " ").valid?
    assert_not Organization.new(name: "a" * 81).valid?
    assert_no_difference -> { Organization.count } do
      assert_raises(ActiveRecord::RecordInvalid) { Organization.create_with_admin!(@admin, name: "") }
    end
    assert_equal 0, @admin.organization_memberships.count, "no membership without a team"
  end

  test "renaming keeps the slug" do
    team = make_team("Semisto", admin: @admin)
    team.update!(name: "Semisto Academy")
    assert_equal "semisto", team.reload.slug
  end

  test "deleting a team gives its maps back to their owners and drops the access it gave" do
    member = make_user("Dana")
    team = make_team(admin: users(:bob), members: [ member, @admin ])
    @map.update!(organization: team)
    CommentSubscription.subscribe(member, @map)
    CommentSubscription.subscribe(users(:alice), @map)

    users = team.users.to_a
    team.destroy!
    Organization.purge_lost_access(users:, maps: [ @map ])

    assert_nil @map.reload.organization_id
    assert Map.exists?(@map.id), "no map is deleted"
    assert_nil @map.role_for(member)
    assert_equal 0, OrganizationMembership.where(user: member).count
    assert_not CommentSubscription.subscribed?(member, @map)
    assert CommentSubscription.subscribed?(users(:alice), @map), "direct members keep their subscriptions"
  end
end
