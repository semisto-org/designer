# A short, plain-language explanation of each data layer, shown under its
# toggle in the "Couches" panel. Catalogue content, so it lives with the
# layer in the database (the catalogue grows without a deploy).
class AddDescriptionToRegionLayers < ActiveRecord::Migration[8.1]
  def change
    add_column :region_layers, :description, :text
  end
end
