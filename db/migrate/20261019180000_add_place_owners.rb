# The people who own the land a map draws (« propriétaires du lieu »), picked
# by the map's owner among its members and invitees, and the two choices only
# they make: show the plants in the ground to other gardeners, and let them
# ask for scions, cuttings or seeds (PropagationRequest).
class AddPlaceOwners < ActiveRecord::Migration[8.1]
  def change
    add_column :map_memberships, :place_owner, :boolean, default: false, null: false
    add_column :map_invitations, :place_owner, :boolean, default: false, null: false
    add_column :maps, :shares_planted_palette, :boolean, default: false, null: false
    add_column :maps, :accepts_propagation_requests, :boolean, default: false, null: false
    add_index :maps, :shares_planted_palette, where: "shares_planted_palette"
  end
end
