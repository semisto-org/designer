# A territory keeps its coarse relief of the whole commune (detail_key nil)
# and, beside it, fine windows at 5 m imported on demand around the places
# an AI looks at (Relief::DetailWindow): one per window key.
class AddDetailKeyToMapTerrains < ActiveRecord::Migration[8.1]
  def change
    add_column :map_terrains, :detail_key, :string
    remove_index :map_terrains, :territory_id, unique: true, name: "index_map_terrains_on_territory_id"
    add_index :map_terrains, [ :territory_id, :detail_key ], unique: true, nulls_not_distinct: true, where: "territory_id IS NOT NULL",
              name: "index_map_terrains_on_territory_id_and_detail_key"
  end
end
