# Drone views anyone editing a map can import (GeoTIFF, MBTiles or PMTiles),
# turned into one PMTiles archive kept with the map's files. A view staff
# set up by its address keeps its url; an imported one has none.
class AddUploadsToAerialViews < ActiveRecord::Migration[8.1]
  def change
    change_table :aerial_views, bulk: true do |t|
      t.string :status, null: false, default: "ready"
      t.string :failure
      t.string :source_filename
      t.bigint :source_byte_size
      t.jsonb :bounds
      t.references :source_upload, foreign_key: { to_table: :mcp_uploads, on_delete: :nullify }, index: true
    end
    change_column_null :aerial_views, :url, true
  end
end
