# PFAF only cross-checks a value (PlantSource.cross_check_only?): the source
# that said the same, next to the value's own source (« recoupée avec PFAF »).
class AddCrossCheckedWithToPlantFieldSources < ActiveRecord::Migration[8.1]
  def change
    add_column :plant_field_sources, :cross_checked_with, :string
  end
end
