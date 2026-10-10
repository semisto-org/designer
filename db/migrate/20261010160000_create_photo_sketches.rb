# Sketches drawn over a photo of the terrain: an idea drawn on the place as
# it is (« une haie ici, la mare là »). A photo can carry several sketches,
# one per idea. Strokes are vectors in the photo's own frame (0..1 of its
# width and height), so they fit every size of the image and stay editable.
class CreatePhotoSketches < ActiveRecord::Migration[8.1]
  def change
    create_table :photo_sketches do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :map_photo, null: false, foreign_key: { on_delete: :cascade }
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :name, null: false
      t.jsonb :strokes, null: false, default: []
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    # So the « Photos » panel can mark and filter sketched photos without a query per photo.
    add_column :map_photos, :sketches_count, :integer, null: false, default: 0
  end
end
