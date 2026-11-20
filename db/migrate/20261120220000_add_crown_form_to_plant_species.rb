class AddCrownFormToPlantSpecies < ActiveRecord::Migration[8.1]
  def change
    add_column :plant_species, :crown_form, :string
  end
end
