# A deleted map element goes to a trash for a while, so « Annuler » (⌘Z) can
# bring it back whole: same id, plant number, photos, readings, comments.
class AddDeletedAtToMapFeatures < ActiveRecord::Migration[8.1]
  def change
    add_column :map_features, :deleted_at, :datetime
    add_index :map_features, :deleted_at, where: "deleted_at IS NOT NULL"
  end
end
