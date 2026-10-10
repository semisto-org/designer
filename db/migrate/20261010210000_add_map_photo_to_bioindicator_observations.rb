# A bio-indicator plant noted from a photo keeps that photo (stored in the
# map's photos, with its position). Deleting the photo keeps the observation.
class AddMapPhotoToBioindicatorObservations < ActiveRecord::Migration[8.1]
  def change
    add_reference :bioindicator_observations, :map_photo, foreign_key: { on_delete: :nullify }
  end
end
