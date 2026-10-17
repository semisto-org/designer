class AddUsesAndSeasonToPlantVarieties < ActiveRecord::Migration[8.1]
  def change
    change_table :plant_varieties, bulk: true do |t|
      t.string :uses, array: true, default: [], null: false
      t.integer :picking_month
      t.integer :eating_from_month
      t.integer :eating_until_month
    end
  end
end
