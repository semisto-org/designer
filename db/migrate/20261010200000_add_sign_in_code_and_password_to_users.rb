class AddSignInCodeAndPasswordToUsers < ActiveRecord::Migration[8.1]
  def change
    # Optional password (sign-in by link, code or Google keeps working without one).
    add_column :users, :password_digest, :string
    # The one-time code sent with the magic link, stored as a digest.
    add_column :users, :sign_in_code_digest, :string
    add_column :users, :sign_in_code_sent_at, :datetime
    add_column :users, :sign_in_code_attempts, :integer, default: 0, null: false
  end
end
