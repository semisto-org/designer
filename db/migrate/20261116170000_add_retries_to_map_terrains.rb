# A territory's relief retries on its own after a provider failure: how many
# attempts it made, when the next one runs and when it was queued, so the MCP
# can say where it stands (queued, running, failed and why, retry at).
class AddRetriesToMapTerrains < ActiveRecord::Migration[8.1]
  def change
    add_column :map_terrains, :attempts, :integer, default: 0, null: false
    add_column :map_terrains, :queued_at, :datetime
    add_column :map_terrains, :retry_at, :datetime
  end
end
