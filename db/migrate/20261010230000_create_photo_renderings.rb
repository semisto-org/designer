# « Mettre en image »: a photo, with the sketch drawn on it, sent to an image
# model (Magnific) that paints the idea as it could look once realised, as a
# photo, a watercolour or a pencil drawing. The result is a new photo of the
# map, linked to the one it came from, so it can be sketched on in turn.
class CreatePhotoRenderings < ActiveRecord::Migration[8.1]
  def change
    create_table :photo_renderings do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :map_photo, null: false, foreign_key: { on_delete: :cascade }
      t.references :photo_sketch, foreign_key: { on_delete: :nullify }
      t.references :requested_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :result_photo, foreign_key: { to_table: :map_photos, on_delete: :nullify }
      t.string :style, null: false
      t.text :instructions
      t.string :status, null: false, default: "queued"
      t.string :task_id
      t.string :error_code
      t.datetime :submitted_at
      t.datetime :finished_at
      t.timestamps
    end

    add_reference :map_photos, :derived_from, foreign_key: { to_table: :map_photos, on_delete: :nullify }
    add_column :map_photos, :rendering_style, :string
  end
end
