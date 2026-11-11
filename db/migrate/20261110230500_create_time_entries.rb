# « Temps et dépenses »: the hours each designer works on a project, with
# the trip that went with them, until they are invoiced.
class CreateTimeEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :time_entries do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.date :worked_on, null: false
      t.integer :minutes, null: false
      t.string :phase, null: false
      t.boolean :billable, null: false, default: true
      t.string :non_billable_reason
      t.text :note
      t.string :bill_to
      t.decimal :trip_km, precision: 7, scale: 1
      t.string :trip_from
      t.string :trip_to
      t.datetime :invoiced_at
      t.string :invoice_number
      t.string :source, null: false, default: "web"
      t.timestamps
    end
    add_index :time_entries, %i[user_id worked_on]
    add_index :time_entries, %i[map_id worked_on]
  end
end
