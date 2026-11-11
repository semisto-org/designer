# « Temps et dépenses », second part: what a project cost besides time
# (plants, mulch, tree guards…), who paid it, and whether the client sees
# the project's progress and expenses.
class CreateProjectExpenses < ActiveRecord::Migration[8.1]
  def change
    create_table :project_expenses do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, foreign_key: { on_delete: :nullify }
      t.date :spent_on, null: false
      t.string :label, null: false
      t.string :supplier
      t.string :category, null: false
      t.string :phase
      t.integer :amount_cents, null: false
      t.integer :vat_rate, null: false, default: 21
      t.string :paid_by, null: false
      t.text :note
      t.string :source, null: false, default: "web"
      t.timestamps
    end
    add_index :project_expenses, %i[map_id spent_on]
    add_column :maps, :time_shared_with_client, :boolean, null: false, default: false
  end
end
