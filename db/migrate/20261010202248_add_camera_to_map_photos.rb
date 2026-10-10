class AddCameraToMapPhotos < ActiveRecord::Migration[8.1]
  def change
    # What the file says about the camera (PhotoCamera); null until read.
    add_column :map_photos, :camera, :jsonb
  end
end
