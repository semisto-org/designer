# A dated aerial view of a map (« Vue drone »): an orthophoto taken by
# Semisto, served as raster tiles straight from where it is hosted (an XYZ
# template or one PMTiles archive). A map keeps every view it was given,
# newest first: that is its history of views. A view may deliver a drone
# order (PlanPurchase); removing either never removes the other.
class CreateAerialViews < ActiveRecord::Migration[8.1]
  def change
    create_table :aerial_views do |t|
      t.references :map, null: false, foreign_key: true, index: false
      t.string :name, null: false
      t.date :captured_on, null: false
      t.string :kind, null: false
      t.string :url, null: false, limit: 2048
      t.string :attribution
      t.integer :min_zoom
      t.integer :max_zoom
      t.references :plan_purchase, foreign_key: { on_delete: :nullify }
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.timestamps
    end
    add_index :aerial_views, %i[map_id captured_on]
  end
end
