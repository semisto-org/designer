# Regions get a real outline (to pick a map's region from its place) and an
# optional parent (the "europe" base region whose layers and settings they
# inherit and override).
class AddOutlineAndParentToRegions < ActiveRecord::Migration[8.1]
  def change
    add_column :regions, :outline, :multi_polygon, srid: 4326
    add_index :regions, :outline, using: :gist
    add_reference :regions, :parent, foreign_key: { to_table: :regions }, null: true
  end
end
