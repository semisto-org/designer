# Free zones and lines of the « Zone » tool leave the « Notes » layer for
# their own « Dessins » layer: a line or a zone read as a note (Michael, 2026-11-03).
class MoveFreeDrawingsToDrawingsLayer < ActiveRecord::Migration[8.1]
  def up
    execute "UPDATE map_features SET layer = 'drawings' WHERE layer = 'notes' AND kind IN ('zone', 'line')"
  end

  def down
    execute "UPDATE map_features SET layer = 'notes' WHERE layer = 'drawings'"
  end
end
