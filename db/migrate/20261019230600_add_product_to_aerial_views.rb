# What an imported drone view shows: an orthophoto (colours), or one band
# coloured on import (elevation model, thermal mosaic, vegetation index).
class AddProductToAerialViews < ActiveRecord::Migration[8.1]
  def change
    add_column :aerial_views, :product, :string, null: false, default: "orthophoto"
  end
end
