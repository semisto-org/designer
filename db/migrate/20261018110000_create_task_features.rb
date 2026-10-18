# A task can be about elements of its map (« Tailler les pommiers 7 et 9 »):
# the plants, a hedge, a pond… From the element one sees what there is to do
# there, from the task one finds the elements on the map.
class CreateTaskFeatures < ActiveRecord::Migration[8.1]
  def change
    create_table :task_features do |t|
      t.references :task, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :map_feature, null: false, foreign_key: { on_delete: :cascade }
      t.datetime :created_at, null: false
    end
    add_index :task_features, %i[task_id map_feature_id], unique: true
  end
end
