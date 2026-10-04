# Team roles are admin | member. The first draft of the model had
# "designer" and "intern", which grant the same rights as a member.
class SimplifyOrganizationRoles < ActiveRecord::Migration[8.1]
  def up
    execute "UPDATE organization_memberships SET role = 'member' WHERE role IN ('designer', 'intern')"
    change_column_default :organization_memberships, :role, from: "designer", to: "member"
  end

  def down
    change_column_default :organization_memberships, :role, from: "member", to: "designer"
    execute "UPDATE organization_memberships SET role = 'designer' WHERE role = 'member'"
  end
end
