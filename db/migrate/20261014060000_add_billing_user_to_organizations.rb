# The member whose plan pays for a team's maps (« Forfait de l'équipe »).
# Null: each team map follows its owner's plan, as before. Set: every map of
# the team follows this member's plan, whoever created it, so a designer's
# own maps and the team's never share one allowance.
class AddBillingUserToOrganizations < ActiveRecord::Migration[8.1]
  def change
    add_reference :organizations, :billing_user, foreign_key: { to_table: :users, on_delete: :nullify }
  end
end
