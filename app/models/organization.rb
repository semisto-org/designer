# A team ("équipe") that maps can be shared with: Semisto's design office
# first. Every member edits every map of the team without taking one of the
# map's three editor seats (Map#role_for). A team map still belongs to its
# owner and follows the owner's plan (Entitlements.for_map): there is no team
# billing yet.
#
# Team roles: admins rename the team, invite, change roles and remove
# members; members work on the team's maps. A team always keeps an admin.
# Moving a map in or out of a team is the map owner's decision only.
class Organization < ApplicationRecord
  NAME_MAX_LENGTH = 80

  has_many :memberships, class_name: "OrganizationMembership", dependent: :destroy
  has_many :users, through: :memberships
  has_many :invitations, class_name: "OrganizationInvitation", dependent: :destroy
  has_many :maps, dependent: :nullify

  normalizes :name, with: ->(n) { n.to_s.squish }
  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH }
  validates :slug, presence: true, uniqueness: true

  before_validation :assign_slug, on: :create

  # Creates the team with `user` as its first admin.
  def self.create_with_admin!(user, name:)
    transaction do
      create!(name:).tap { |team| team.memberships.create!(user:, role: "admin") }
    end
  end

  def membership_for(user)
    user && memberships.find_by(user:)
  end

  def role_for(user) = membership_for(user)&.role
  def member?(user) = role_for(user).present?
  def admin?(user) = role_for(user) == "admin"

  def admins_count = memberships.where(role: "admin").count

  # Removes everyone's access gained through the team on these maps (thread
  # subscriptions of people who can no longer open a map are dropped).
  def self.purge_lost_access(users:, maps:)
    maps.each do |map|
      map.reload
      users.each { |user| CommentSubscription.purge(user, map) unless map.viewable_by?(user) }
    end
  end

  private
    # The slug is a stable handle (not shown in URLs yet). Two teams may
    # share a name, so a taken slug gets a short random suffix.
    def assign_slug
      return if slug.present?
      base = name.to_s.parameterize.presence || "equipe"
      candidate = base
      candidate = "#{base}-#{SecureRandom.alphanumeric(6).downcase}" while self.class.exists?(slug: candidate)
      self.slug = candidate
    end
end
