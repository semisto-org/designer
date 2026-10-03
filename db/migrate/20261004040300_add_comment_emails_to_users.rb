class AddCommentEmailsToUsers < ActiveRecord::Migration[8.1]
  def change
    # Per-user switch for discussion e-mails (mentions and new comments).
    add_column :users, :comment_emails, :boolean, null: false, default: true
  end
end
