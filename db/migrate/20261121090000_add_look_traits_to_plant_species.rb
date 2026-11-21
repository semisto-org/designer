class AddLookTraitsToPlantSpecies < ActiveRecord::Migration[8.1]
  def change
    change_table :plant_species, bulk: true do |t|
      t.string :foliage_tone
      t.string :leaf_texture
      t.string :crown_density
      t.string :flower_color
      t.string :fruit_color
      t.string :bark_color
      t.string :autumn_color
    end
  end
end
