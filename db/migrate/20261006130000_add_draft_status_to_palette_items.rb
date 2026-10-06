# Palette entries an AI proposes (MCP propose_palette) wait as drafts, with
# their rationale, until a human accepts or refuses them in the Palette panel.
class AddDraftStatusToPaletteItems < ActiveRecord::Migration[8.1]
  def change
    add_column :palette_items, :status, :string, default: "active", null: false
    add_column :palette_items, :source, :string, default: "human", null: false
    add_column :palette_items, :rationale, :text
  end
end
