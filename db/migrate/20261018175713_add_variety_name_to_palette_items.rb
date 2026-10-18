# A palette draft can name a cultivar the catalogue doesn't know yet (an AI
# read 'Double Philippe' in the person's list): the cultivar is created only
# when a human accepts the draft. Until then a draft with a variety_name is
# not the species-level entry, so the species index leaves it out.
class AddVarietyNameToPaletteItems < ActiveRecord::Migration[8.1]
  def change
    add_column :palette_items, :variety_name, :string
    remove_index :palette_items, %i[map_id species_id], name: "index_palette_items_unique_species", unique: true, where: "(variety_id IS NULL)"
    add_index :palette_items, %i[map_id species_id], name: "index_palette_items_unique_species", unique: true,
              where: "(variety_id IS NULL AND variety_name IS NULL)"
  end
end
