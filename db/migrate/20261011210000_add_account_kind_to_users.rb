# Who the person designs for, asked once after the first sign-in (welcome
# page) and changeable in « Mon compte »: their own place (individual) or
# clients (professional). Null until they choose. It decides which tools and
# plans they are shown, never what they may do: entitlements stay with the plan.
class AddAccountKindToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :account_kind, :string
    add_check_constraint :users, "account_kind IN ('individual', 'professional')", name: "users_account_kind_check"
  end
end
