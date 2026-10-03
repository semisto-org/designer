# Discussions "façon Basecamp": a thread hangs on any commentable object of a
# map (the map itself, a feature, later photos, analyses…).
class CreateComments < ActiveRecord::Migration[8.1]
  def change
    create_table :comments do |t|
      t.references :map, null: false, foreign_key: true
      t.references :commentable, polymorphic: true, null: false, index: false
      t.references :author, null: false, foreign_key: { to_table: :users }
      t.text :body, null: false
      t.bigint :mentioned_user_ids, array: true, null: false, default: []
      t.datetime :edited_at
      t.datetime :deleted_at
      t.timestamps
    end
    add_index :comments, %i[commentable_type commentable_id created_at], name: "index_comments_on_thread"
    add_index :comments, %i[map_id created_at]

    create_table :applauses do |t|
      t.references :comment, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.timestamps
    end
    add_index :applauses, %i[comment_id user_id], unique: true

    create_table :comment_subscriptions do |t|
      t.references :user, null: false, foreign_key: true
      t.references :commentable, polymorphic: true, null: false, index: false
      t.timestamps
    end
    add_index :comment_subscriptions, %i[commentable_type commentable_id user_id], unique: true, name: "index_comment_subscriptions_unique"

    # When a user last opened a thread: drives the "unread" markers.
    create_table :comment_reads do |t|
      t.references :user, null: false, foreign_key: true
      t.references :commentable, polymorphic: true, null: false, index: false
      t.datetime :last_read_at, null: false
      t.timestamps
    end
    add_index :comment_reads, %i[user_id commentable_type commentable_id], unique: true, name: "index_comment_reads_unique"
  end
end
