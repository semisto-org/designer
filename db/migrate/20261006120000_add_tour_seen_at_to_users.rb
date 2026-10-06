# When the person closed the editor's « carnet de route » (the guided tour of
# the four steps) for the first time. Null: it opens on their next arrival on
# a map they can edit.
class AddTourSeenAtToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :tour_seen_at, :datetime
  end
end
