class CreateMapFeatures < ActiveRecord::Migration[8.1]
  def change
    # Everything drawn on a map: survey of what exists, design elements
    # (WASPA layers), plants and patches, networks, measures, sketches.
    create_table :map_features do |t|
      t.references :map, null: false, foreign_key: true
      # existing | water | access | structures | plants | animals | networks | notes
      t.string :layer, null: false, default: "existing"
      # Element type: zone, line, point, building, tree, pond, swale, hedge,
      # path, fence, patch, plant, measure, sketch, water_pipe…
      t.string :kind, null: false
      t.string :name
      t.text :notes
      t.st_geometry :geometry, srid: 4326, null: false
      t.jsonb :properties, null: false, default: {}
      t.jsonb :style, null: false, default: {}
      # active | draft (proposed by an AI, waiting for human review) | rejected
      t.string :status, null: false, default: "active"
      # human | ai
      t.string :source, null: false, default: "human"
      t.text :rationale
      t.references :created_by, foreign_key: { to_table: :users }
      t.references :updated_by, foreign_key: { to_table: :users }
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :map_features, :geometry, using: :gist
    add_index :map_features, [ :map_id, :layer ]
    add_index :map_features, [ :map_id, :status ]
  end
end
