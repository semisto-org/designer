class CreateRegions < ActiveRecord::Migration[8.1]
  def change
    create_table :regions do |t|
      t.string :key, null: false
      t.string :name, null: false
      t.string :country_code, null: false
      t.string :locale, null: false, default: "fr"
      t.boolean :active, null: false, default: true
      t.st_polygon :bounds, srid: 4326
      t.st_point :center, srid: 4326
      t.integer :default_zoom, null: false, default: 8
      # Region-specific settings: providers (cadastre, geocoder, elevation),
      # attribution, regulatory rules, climate defaults.
      t.jsonb :settings, null: false, default: {}
      t.timestamps
    end
    add_index :regions, :key, unique: true

    # Data layers a region offers (Géoportail de Wallonie for Wallonia).
    # Stored in the database so the catalogue grows without a deploy.
    create_table :region_layers do |t|
      t.references :region, null: false, foreign_key: true
      t.string :key, null: false
      t.string :name, null: false
      t.string :group_name
      # base | overlay
      t.string :category, null: false, default: "overlay"
      # wms | xyz | arcgis_rest
      t.string :kind, null: false, default: "wms"
      t.string :url, null: false
      t.string :layers
      t.string :identify_url
      t.string :legend_url
      t.string :attribution
      t.float :opacity, null: false, default: 0.7
      t.integer :min_zoom
      t.integer :max_zoom
      t.integer :position, null: false, default: 0
      t.boolean :enabled, null: false, default: true
      t.boolean :proxied, null: false, default: true
      t.jsonb :options, null: false, default: {}
      t.timestamps
    end
    add_index :region_layers, [ :region_id, :key ], unique: true
  end
end
