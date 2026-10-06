class AddTagsToMapFeatures < ActiveRecord::Migration[8.1]
  def change
    add_column :map_features, :tags, :string, array: true, default: [], null: false
  end
end
