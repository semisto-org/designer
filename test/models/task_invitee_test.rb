require "test_helper"
require_relative "../test_helpers/teams_test_helper"

# A task given to someone invited to the map or its team who has not joined
# yet (Task#invitee_email), and handed over when they join.
class TaskInviteeTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @list = @map.task_lists.create!(name: "Chantier")
    @owner = users(:michael)
  end

  def invite_to_map(email = "dana@example.org")
    @map.invitations.create!(email_address: email, role: "editor", invited_by: @owner)
  end

  def join_as(email)
    User.create!(email_address: email, name: "Dana")
  end

  test "an address invited to the map can be given a task" do
    invite_to_map
    task = @list.tasks.create!(title: "Relever les arbres", invitee_email: " Dana@Example.org ")
    assert_equal "dana@example.org", task.invitee_email
    assert task.assigned?
    assert_equal({ email: "dana@example.org", name: "dana@example.org", invited: true }, task.as_json[:assignee])
  end

  test "an address nobody invited is refused" do
    task = @list.tasks.new(title: "Relever les arbres", invitee_email: "stranger@example.org")
    assert_not task.valid?
    assert_includes task.errors[:invitee_email], "doit être invité·e à la carte ou à son équipe"
  end

  test "an expired invitation no longer counts" do
    invite_to_map.update!(expires_at: 1.minute.ago)
    assert_not @list.tasks.new(title: "Tailler", invitee_email: "dana@example.org").valid?
  end

  test "a task goes to one person at a time" do
    invite_to_map
    task = @list.tasks.create!(title: "Tailler", assignee: users(:alice))
    task.update!(invitee_email: "dana@example.org")
    assert_nil task.assignee_id
    task.update!(assignee: users(:alice))
    assert_nil task.invitee_email
  end

  test "accepting the map invitation hands the tasks over, whatever address signed in" do
    invitation = invite_to_map
    task = @list.tasks.create!(title: "Relever les arbres", invitee_email: "dana@example.org")
    dana = join_as("dana.perso@example.org")
    invitation.accept!(dana)
    task.reload
    assert_equal dana, task.assignee
    assert_nil task.invitee_email
  end

  test "the team's invitees can be given tasks on its maps, and get them when they join" do
    team = make_team(admin: @owner)
    @map.update!(organization: team)
    invitation = team.invitations.create!(email_address: "eli@example.org", invited_by: @owner)
    assert_includes @map.invitee_emails, "eli@example.org"
    task = @list.tasks.create!(title: "Dessiner les haies", invitee_email: "eli@example.org")
    eli = join_as("eli@example.org")
    invitation.accept!(eli)
    assert_equal eli, task.reload.assignee
  end

  test "joining another way, with the invited address, also hands the tasks over" do
    invite_to_map
    task = @list.tasks.create!(title: "Relever les arbres", invitee_email: "dana@example.org")
    dana = join_as("dana@example.org")
    @map.memberships.create!(user: dana, role: "viewer")
    assert_equal dana, task.reload.assignee
  end

  test "withdrawing the invitation frees the task" do
    invitation = invite_to_map
    task = @list.tasks.create!(title: "Relever les arbres", invitee_email: "dana@example.org")
    invitation.destroy!
    assert_nil task.reload.invitee_email
  end

  test "someone who joined without using the invitation is no longer an invitee" do
    team = make_team(admin: @owner)
    @map.update!(organization: team)
    team.invitations.create!(email_address: "dana@example.org", invited_by: @owner)
    assert_includes @map.invitee_emails, "dana@example.org"
    @map.memberships.create!(user: join_as("dana@example.org"), role: "viewer")
    assert_not_includes @map.invitee_emails, "dana@example.org"
  end

  test "the board lists invitees after the participants" do
    invite_to_map
    people = TaskBoard.new(@map).participants
    assert_equal({ email: "dana@example.org", name: "dana@example.org", role: "invited" }, people.last)
  end
end
