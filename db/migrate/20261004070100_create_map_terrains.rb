# The relief of a map: an elevation grid (and its surface model, land cover
# and ortho texture) imported from the region's elevation provider, on a
# regular grid in EPSG:3857 so the ortho drapes pixel for pixel. The rasters
# are Active Storage blobs; this row carries the grid geometry and the import
# state. One per map: a new import replaces the previous one.
class CreateMapTerrains < ActiveRecord::Migration[8.1]
  def change
    create_table :map_terrains do |t|
      t.references :map, null: false, foreign_key: true, index: { unique: true }
      # pending | running | ready | failed
      t.string :status, null: false, default: "pending"
      t.string :provider
      t.string :crs, null: false, default: "EPSG:3857"
      # Grid: north-west cell centre (EPSG:3857 metres), step in 3857 units,
      # ground cell size in metres, size in cells.
      t.float :west
      t.float :north
      t.float :step
      t.float :cell_size_m
      t.integer :cols
      t.integer :rows
      t.float :lat0
      t.float :margin_m
      # Uint16 encoding of heights: z = z_min + raw * z_unit, raw = nodata → no data.
      t.float :z_min
      t.float :z_max
      t.float :z_unit, null: false, default: 0.01
      t.integer :nodata, null: false, default: 65_535
      t.integer :nodata_count
      # Extent with its margin, in WGS84.
      t.st_polygon :extent, srid: 4326
      # Sources, licences, surface/landcover/texture descriptors, statistics.
      t.jsonb :metadata, null: false, default: {}
      t.integer :progress, null: false, default: 0
      t.datetime :started_at
      t.datetime :fetched_at
      t.text :error
      t.timestamps
    end

    # Per-map water and soil parameters (rainfall, roof coefficient, soil
    # type…), merged over the region's defaults.
    add_column :maps, :water_settings, :jsonb, null: false, default: {}
  end
end
