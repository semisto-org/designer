# A territory (« Territoire », a whole commune) gets a relief of its own, at a
# coarser grid than a map's, so that get_catchment can trace a catchment
# anywhere in it. A terrain belongs to exactly one map or one territory.
class AddTerritoryToMapTerrains < ActiveRecord::Migration[8.1]
  def change
    add_reference :map_terrains, :territory, foreign_key: { on_delete: :cascade }, index: { unique: true }
    change_column_null :map_terrains, :map_id, true
    add_check_constraint :map_terrains, "num_nonnulls(map_id, territory_id) = 1", name: "map_terrains_one_owner"
  end
end
