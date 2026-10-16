require "test_helper"

class TaskMailerTest < ActionMailer::TestCase
  test "assigned names the task, its due date and links to the map's tasks" do
    map = maps(:ahinvaux)
    task = map.task_lists.create!(name: "Planter").tasks.create!(title: "Commander les plants", notes: "Chez la pépinière", assignee: users(:alice), due_on: Date.new(2026, 11, 15))
    mail = TaskMailer.assigned(task, users(:michael))
    assert_equal [ users(:alice).email_address ], mail.to
    assert_match map.name, mail.subject
    assert_match "Commander les plants", mail.text_part.body.to_s
    assert_match "15 novembre 2026", mail.text_part.body.to_s
    assert_match "/maps/#{map.id}/tasks", mail.html_part.body.to_s
  end

  test "an invitee without an account gets their invitation link" do
    map = maps(:ahinvaux)
    invitation = map.invitations.create!(email_address: "dana@example.org", role: "editor", invited_by: users(:michael))
    task = map.task_lists.create!(name: "Planter").tasks.create!(title: "Relever les arbres", invitee_email: "dana@example.org")
    mail = TaskMailer.assigned(task, users(:michael))
    assert_equal [ "dana@example.org" ], mail.to
    assert_match "/invitations/#{invitation.token}", mail.html_part.body.to_s
    assert_match "Accepter l'invitation", mail.text_part.body.to_s
  end
end
