class AddPlaybackToMapPhotos < ActiveRecord::Migration[8.1]
  def change
    # How a video plays in the browser: native (its own file), converted (an
    # H.264 copy in `playable`), failed. Null until checked; photos stay null.
    add_column :map_photos, :playback, :string
  end
end
