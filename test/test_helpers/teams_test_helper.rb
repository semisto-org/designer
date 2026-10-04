require_relative "collab_test_helper"

# Helpers for the team tests: a team with an admin and members.
module TeamsTestHelper
  def make_team(name = "Bureau d'études", admin:, members: [])
    team = Organization.create_with_admin!(admin, name:)
    members.each { |user| team.memberships.create!(user:, role: "member") }
    team
  end
end

ActiveSupport::TestCase.include TeamsTestHelper
ActionDispatch::IntegrationTest.include TeamsTestHelper
