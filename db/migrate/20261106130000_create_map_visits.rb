# When each person last opened each map: « Mes cartes » opens large the map
# that person worked on last, not the one anybody changed last (a team map
# edited by a colleague is not where I stopped).
class CreateMapVisits < ActiveRecord::Migration[8.1]
  def change
    create_table :map_visits do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.datetime :opened_at, null: false
    end
    add_index :map_visits, [ :user_id, :map_id ], unique: true
  end
end
