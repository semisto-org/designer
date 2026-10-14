# A team map can be one of the team's own places (a teaching food forest, a
# nursery…) rather than a client project: it stays with the team but has no
# phase on the team board.
class AddOwnPlaceToMaps < ActiveRecord::Migration[8.1]
  def change
    add_column :maps, :own_place, :boolean, default: false, null: false
  end
end
