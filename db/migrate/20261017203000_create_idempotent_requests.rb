class CreateIdempotentRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :idempotent_requests do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.string :key, null: false
      t.integer :status, null: false
      t.text :body, null: false, default: ""
      t.datetime :created_at, null: false
    end
    add_index :idempotent_requests, %i[user_id key], unique: true
    add_index :idempotent_requests, :created_at
  end
end
