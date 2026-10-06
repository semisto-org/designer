# Plan images of a map (« Fonds de plan »): a sketch or a plan handed to a
# client, laid on the map under the drawing to put elements back in place.
# The pose is a center, a width on the ground and a rotation; the height
# follows the image's aspect ratio.
class CreatePlanImages < ActiveRecord::Migration[8.1]
  def change
    create_table :plan_images do |t|
      t.references :map, null: false, foreign_key: true
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :name, null: false
      t.float :center_lng, null: false
      t.float :center_lat, null: false
      t.float :width_m, null: false
      t.float :rotation, null: false, default: 0
      t.float :aspect, null: false, default: 1
      t.float :opacity, null: false, default: 0.7
      t.boolean :visible, null: false, default: true
      t.integer :position, null: false, default: 0
      t.timestamps
    end
  end
end
