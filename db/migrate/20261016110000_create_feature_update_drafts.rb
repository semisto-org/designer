# Changes an AI proposes to an element already on the map (a planting date,
# a species, a name, tags, notes, a position). A human accepts, adjusts or
# rejects them in the editor; the accepted ones stay as the element's
# history of AI-proposed changes.
class CreateFeatureUpdateDrafts < ActiveRecord::Migration[8.1]
  def change
    create_table :feature_update_drafts do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :map_feature, null: false, foreign_key: { on_delete: :cascade }
      # One call of propose_feature_updates: reviewed together (« Tout accepter »).
      t.string :batch, null: false
      t.text :summary
      t.jsonb :proposed_changes, null: false, default: {}
      t.text :rationale, null: false
      t.string :status, null: false, default: "pending"
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :client_name
      t.references :reviewed_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :reviewed_at
      # What was applied on acceptance (the proposal, or the person's adjustment), and what it replaced.
      t.jsonb :applied_changes
      t.jsonb :previous_values
      t.timestamps
    end
    add_index :feature_update_drafts, %i[map_id status]
    add_index :feature_update_drafts, :map_feature_id, unique: true, where: "status = 'pending'", name: "index_feature_update_drafts_one_pending"
  end
end
