# Discussion notifications (Michael, 2026-11-04): each person chooses, for all
# their maps, where a discussion message reaches them (the bell in the app,
# e-mail, the phone), and, map by map, how much of it (every message, only
# when mentioned, nothing). E-mail keeps its switch `users.comment_emails`.
# The phone app registers its Expo push token (`push_devices`).
class AddChatNotificationSettings < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :chat_notify_app, :boolean, default: true, null: false
    add_column :users, :chat_notify_push, :boolean, default: true, null: false
    # « Rien » on one map: not even a mention reaches the person (muted = the
    # digest and the other messages, already there).
    add_column :comment_subscriptions, :silenced, :boolean, default: false, null: false

    create_table :push_devices do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :token, null: false
      t.string :platform
      t.datetime :last_seen_at
      t.timestamps
    end
    add_index :push_devices, :token, unique: true
  end
end
