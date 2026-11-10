# When each member last opened their team's board: the main menu's « Équipe »
# goes straight back to the board of the team they worked with last.
class AddBoardOpenedAtToOrganizationMemberships < ActiveRecord::Migration[8.1]
  def change
    add_column :organization_memberships, :board_opened_at, :datetime
  end
end
