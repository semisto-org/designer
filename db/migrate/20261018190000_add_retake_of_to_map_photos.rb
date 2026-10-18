class AddRetakeOfToMapPhotos < ActiveRecord::Migration[8.1]
  def change
    add_reference :map_photos, :retake_of, foreign_key: { to_table: :map_photos, on_delete: :nullify }, index: true
  end
end
