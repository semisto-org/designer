# « Territoire »: Terranova at the scale of a commune. Semisto grants the
# module to a team from the admin (a team never turns it on itself); its
# members then open territories by the commune's name and gather a dossier
# (people already at work there, sources, what the territory expects, dated
# markers, layout leads) that becomes the « carnet du territoire ».
class CreateTerritories < ActiveRecord::Migration[8.1]
  def change
    add_column :organizations, :territory_module_granted_at, :datetime

    create_table :territories do |t|
      t.references :organization, null: false, foreign_key: { on_delete: :cascade }
      t.references :region, foreign_key: { on_delete: :nullify }
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :name, null: false
      t.geometry :boundary, limit: { srid: 4326, type: "multi_polygon" }, null: false
      t.geometry :center, limit: { srid: 4326, type: "st_point" }, null: false
      t.float :area_m2, null: false
      # Where the boundary comes from: provider, its id, licence, label.
      t.jsonb :boundary_source, null: false, default: {}
      # The notebook's own words: introduction, the next step and its budget.
      t.jsonb :notebook, null: false, default: {}
      t.datetime :archived_at
      t.timestamps
    end
    add_index :territories, :boundary, using: :gist

    create_table :territory_items do |t|
      t.references :territory, null: false, foreign_key: { on_delete: :cascade }, index: false
      # actor | source | expectation | marker | lead
      t.string :kind, null: false
      t.string :status, null: false, default: "active"
      t.string :source, null: false, default: "human"
      t.string :title, null: false
      t.text :body
      t.text :rationale
      t.geometry :geometry, limit: { srid: 4326, type: "geometry" }
      t.jsonb :properties, null: false, default: {}
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :decided_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :decided_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :territory_items, %i[territory_id kind status]
    add_index :territory_items, :geometry, using: :gist
  end
end
