class CreateMapPhases < ActiveRecord::Migration[8.1]
  def change
    create_table :map_phases do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.integer :number, null: false
      t.string :name, null: false
      t.text :notes
      t.jsonb :snapshot, default: [], null: false
      t.jsonb :counts, default: {}, null: false
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.timestamps
    end
    add_index :map_phases, %i[map_id number], unique: true
    add_column :maps, :design_phase_name, :string
  end
end
