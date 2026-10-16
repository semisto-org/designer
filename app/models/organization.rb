# A team ("équipe") that maps can be shared with: Semisto's design office
# first. Every member edits every map of the team without taking one of the
# map's three editor seats (Map#role_for). A team map still belongs to its
# owner. It follows the plan of the team's billing user when an admin took
# that role (« Forfait de l'équipe »), else its owner's plan
# (Map#billing_user, Entitlements.for_map).
#
# Team roles: admins rename the team, invite, change roles and remove
# members; members work on the team's maps. A team always keeps an admin.
# Moving a map in or out of a team is the map owner's decision only.
class Organization < ApplicationRecord
  include HasLogo

  NAME_MAX_LENGTH = 80

  belongs_to :billing_user, class_name: "User", optional: true
  has_many :memberships, class_name: "OrganizationMembership", dependent: :destroy
  has_many :users, through: :memberships
  has_many :invitations, class_name: "OrganizationInvitation", dependent: :destroy
  has_many :maps, dependent: :nullify
  has_many :offer_templates, as: :owner, dependent: :destroy
  has_one :request_form, as: :owner, dependent: :destroy
  has_one :form_inbox, dependent: :destroy

  normalizes :name, with: ->(n) { n.to_s.squish }
  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH }
  validates :slug, presence: true, uniqueness: true
  validate :billing_user_is_admin, if: :billing_user_id

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

  # After people lost the access a team gave them on these maps: drops their
  # thread subscriptions on the maps they can no longer open (direct members
  # keep theirs). One query per map when nobody followed anything there.
  def self.purge_lost_access(users:, maps:)
    user_ids = users.map(&:id)
    return if user_ids.empty?
    maps.each do |map|
      subscribed = CommentSubscription.where(user_id: user_ids, commentable_type: "Map", commentable_id: map.id)
        .or(CommentSubscription.where(user_id: user_ids, commentable_type: "MapFeature", commentable_id: map.features.select(:id)))
        .distinct.pluck(:user_id)
      next if subscribed.empty?
      map.reload
      users.each { |user| CommentSubscription.purge(user, map) if subscribed.include?(user.id) && !map.viewable_by?(user) }
    end
  end

  private
    def billing_user_is_admin
      errors.add(:billing_user, :not_admin) unless admin?(billing_user)
    end

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
