# « Budget du projet »: the invoices a team sent its client, recorded (never
# issued) in Terranova, their amount before VAT split over the project's four
# budget items, and the items' budgets set by hand when the accepted offer
# does not give them (maps.budget_overrides, cents by item).
class CreateProjectInvoices < ActiveRecord::Migration[8.1]
  def change
    create_table :project_invoices do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, foreign_key: { on_delete: :nullify }
      t.string :number, null: false
      t.date :issued_on, null: false
      t.date :paid_on
      t.integer :services_cents, null: false, default: 0
      t.integer :expenses_cents, null: false, default: 0
      t.integer :plants_cents, null: false, default: 0
      t.integer :implementation_cents, null: false, default: 0
      t.integer :vat_cents, null: false, default: 0
      t.text :note
      t.string :source, null: false, default: "web"
      t.timestamps
    end
    add_index :project_invoices, [ :map_id, :number ], unique: true
    add_index :project_invoices, [ :map_id, :issued_on ]

    add_column :maps, :budget_overrides, :jsonb, null: false, default: {}
  end
end
