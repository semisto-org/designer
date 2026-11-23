# The client deliverable (« Livrable client »): a second publication of a map,
# reached by a private link, that adds the documents, photos, videos and soil
# analyses the team marks for it to the plan.
class AddClientDeliverables < ActiveRecord::Migration[8.1]
  def change
    add_column :map_publications, :kind, :string, null: false, default: "public"
    remove_index :map_publications, :map_id, unique: true
    add_index :map_publications, [ :map_id, :kind ], unique: true

    add_column :map_documents, :in_deliverable, :boolean, null: false, default: false
    add_column :map_photos, :in_deliverable, :boolean, null: false, default: false
    add_column :soil_samples, :in_deliverable, :boolean, null: false, default: false
  end
end
