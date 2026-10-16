# A task can wait for someone invited to the map or its team who has no
# account yet: it is given to their e-mail address and moves to their
# account when they join.
class AddInviteeEmailToTasks < ActiveRecord::Migration[8.1]
  def change
    add_column :tasks, :invitee_email, :citext
    add_index :tasks, :invitee_email, where: "invitee_email IS NOT NULL"
  end
end
