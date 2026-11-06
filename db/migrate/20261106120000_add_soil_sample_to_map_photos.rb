# A photo taken at a soil sampling point (the hole, the core, the profile):
# linked to that point, the way a photo is linked to a feature.
class AddSoilSampleToMapPhotos < ActiveRecord::Migration[8.1]
  def change
    add_reference :map_photos, :soil_sample, foreign_key: { on_delete: :nullify }, index: true
  end
end
