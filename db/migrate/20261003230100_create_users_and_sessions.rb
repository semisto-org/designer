class CreateUsersAndSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.citext :email_address, null: false
      t.string :name
      t.string :avatar_url
      t.string :google_uid
      t.boolean :admin, null: false, default: false
      t.string :locale, null: false, default: "fr"
      t.datetime :last_signed_in_at
      t.timestamps
    end
    add_index :users, :email_address, unique: true
    add_index :users, :google_uid, unique: true

    create_table :sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :ip_address
      t.string :user_agent
      t.timestamps
    end
  end
end
