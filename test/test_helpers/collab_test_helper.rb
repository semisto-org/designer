# Helpers for the collaboration tests: extra users and a map with a team.
module CollabTestHelper
  def make_user(name, email: nil)
    User.create!(name:, email_address: email || "#{name.parameterize}-#{SecureRandom.hex(3)}@example.org")
  end

  # Adds a member with a role to the map (bypasses the invitation flow).
  def add_member(map, user, role)
    map.memberships.create!(user:, role:)
    user
  end

  def json
    response.parsed_body
  end

  def with_feature(map, layer: "plants", kind: "tree", name: "Noyer", geometry: point)
    map.features.create!(layer:, kind:, name:, geometry:, created_by: map.owner, updated_by: map.owner)
  end
end

ActiveSupport::TestCase.include CollabTestHelper
ActionDispatch::IntegrationTest.include CollabTestHelper
