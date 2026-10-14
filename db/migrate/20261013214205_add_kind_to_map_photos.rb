# A map's « Photos » also hold videos: `kind` says which one a record is.
class AddKindToMapPhotos < ActiveRecord::Migration[8.1]
  def change
    add_column :map_photos, :kind, :string, null: false, default: "photo"
  end
end
