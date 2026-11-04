# A map's « Présenter » sequence: ordered steps, each a view of the map
# (framing, panel, hidden layers and strata, sectors, moment…) with the
# presenter's note. Steps live in one jsonb array: they belong to their
# presentation only, are read and saved whole, and stay few.
class CreateMapPresentations < ActiveRecord::Migration[8.1]
  def change
    create_table :map_presentations do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.string :template_key
      t.jsonb :steps, null: false, default: []
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
  end
end
