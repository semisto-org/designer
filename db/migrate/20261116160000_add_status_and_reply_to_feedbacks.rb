class AddStatusAndReplyToFeedbacks < ActiveRecord::Migration[8.1]
  def change
    # What became of a feedback, as the person sees it in « Mes retours »:
    # its status, Semisto's answer, and when the person was last told.
    add_column :feedbacks, :status, :string, null: false, default: "received"
    add_column :feedbacks, :reply, :text
    add_column :feedbacks, :status_changed_at, :datetime
    add_column :feedbacks, :author_notified_at, :datetime
    add_reference :feedbacks, :handled_by, foreign_key: { to_table: :users, on_delete: :nullify }
    add_index :feedbacks, :status
  end
end
