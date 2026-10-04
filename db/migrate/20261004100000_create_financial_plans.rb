class CreateFinancialPlans < ActiveRecord::Migration[8.1]
  def change
    create_table :financial_plans do |t|
      t.references :map, null: false, foreign_key: true, index: { unique: true }
      # The user's assumptions, a document typed by FinancialPlan::Schema.
      t.jsonb :inputs, null: false, default: {}
      # Version of that document's schema, to migrate old documents.
      t.integer :schema_version, null: false, default: 1
      t.integer :lock_version, null: false, default: 0
      t.references :updated_by, foreign_key: { to_table: :users }
      t.timestamps
    end
  end
end
