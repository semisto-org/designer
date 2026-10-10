# Photos of wild plants left for the user's AI to read (several species on one
# photo), and the plants it proposes back as drafts the human accepts or refuses.
class AddAiAnalysisToBioindicators < ActiveRecord::Migration[8.1]
  def change
    change_table :map_photos, bulk: true do |t|
      t.string :bioindicator_status
      t.text :bioindicator_summary
      t.datetime :bioindicator_analyzed_at
    end
    add_index :map_photos, [ :map_id, :bioindicator_status ], where: "bioindicator_status IS NOT NULL"

    change_table :bioindicator_observations, bulk: true do |t|
      t.string :status, null: false, default: "active"
      t.string :source, null: false, default: "human"
      t.string :confidence
      t.text :rationale
    end
  end
end
