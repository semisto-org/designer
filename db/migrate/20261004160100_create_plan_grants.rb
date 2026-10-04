# A plan given by hand for a period, without a Stripe purchase: the plan
# paid on invoice (it can start before the payment arrives). It counts like
# a pass while starts_at <= now < ends_at and it is not revoked; nothing is
# ever deleted when it ends.
class CreatePlanGrants < ActiveRecord::Migration[8.1]
  def change
    create_table :plan_grants do |t|
      t.references :user, null: false, foreign_key: true
      t.string :plan_key, null: false
      t.datetime :starts_at, null: false
      t.datetime :ends_at, null: false
      t.datetime :revoked_at
      t.text :notes
      t.references :invoice_request, foreign_key: true, index: { unique: true }
      t.references :granted_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.timestamps
    end
    add_index :plan_grants, %i[user_id ends_at]
  end
end
