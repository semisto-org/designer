# The « Palette végétale » of a map: what each species costs and where it is
# bought (on its palette item), and the table views people save for the map
# (budget, shopping list for a planting day, follow-up…).
class CreatePlantPaletteViews < ActiveRecord::Migration[8.1]
  def change
    change_table :palette_items, bulk: true do |t|
      t.decimal :unit_price, precision: 10, scale: 2
      t.string :supplier
      t.string :size
    end

    create_table :plant_palette_views do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.jsonb :settings, null: false, default: {}
      t.integer :position, null: false, default: 0
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.timestamps
    end
  end
end
