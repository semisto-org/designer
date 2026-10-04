# A person in a team, as admin or member. The team always keeps at least one
# admin: the last one can neither leave nor be demoted (the whole team can
# still be deleted).
#
# Leaving a team does not take one's maps out of it: the team keeps working
# on them ("un stagiaire part, ses cartes restent"), and the owner can still
# take a map out from its sharing dialog.
class OrganizationMembership < ApplicationRecord
  ROLES = %w[admin member].freeze
  # The first draft of the model had these roles; they mean "member".
  LEGACY_ROLES = %w[designer intern].freeze

  belongs_to :organization
  belongs_to :user

  normalizes :role, with: ->(r) { LEGACY_ROLES.include?(r.to_s) ? "member" : r.to_s }
  validates :role, inclusion: { in: ROLES }
  validates :user_id, uniqueness: { scope: :organization_id }
  validate :keeps_an_admin, on: :update, if: :will_save_change_to_role?

  before_destroy :ensure_not_last_admin, unless: :destroyed_by_association
  after_destroy :purge_lost_access, unless: :destroyed_by_association

  scope :admins, -> { where(role: "admin") }

  def admin? = role == "admin"

  # The only admin left: they cannot leave, be removed or demoted.
  def last_admin?
    role_in_database == "admin" && organization.memberships.admins.where.not(id:).none?
  end

  private
    def keeps_an_admin
      errors.add(:role, :last_admin) if role != "admin" && last_admin?
    end

    def ensure_not_last_admin
      return unless last_admin?
      errors.add(:base, :last_admin)
      throw :abort
    end

    # Comment subscriptions on team maps the person can no longer open.
    def purge_lost_access
      Organization.purge_lost_access(users: [ user ], maps: organization.maps.to_a)
    end
end
