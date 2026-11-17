# A team ("équipe") that maps can be shared with: Semisto's design office
# first. Every member edits every map of the team without being invited on
# it (Map#role_for). A team map still belongs to its
# owner. It follows the plan of the team's billing user when an admin took
# that role (« Forfait de l'équipe »), else its owner's plan
# (Map#billing_user, Entitlements.for_map).
#
# Team roles: admins rename the team, invite, change roles and remove
# members; members work on the team's maps. A team always keeps an admin.
# Moving a map in or out of a team is the map owner's decision only.
class Organization < ApplicationRecord
  include HasLogo
  include HasDocumentTheme

  NAME_MAX_LENGTH = 80

  belongs_to :billing_user, class_name: "User", optional: true
  has_many :memberships, class_name: "OrganizationMembership", dependent: :destroy
  has_many :users, through: :memberships
  has_many :invitations, class_name: "OrganizationInvitation", dependent: :destroy
  has_many :maps, dependent: :nullify
  # The sections of the team board's columns (BoardSection).
  has_many :board_sections, dependent: :delete_all
  has_many :offer_templates, as: :owner, dependent: :destroy
  has_one :request_form, as: :owner, dependent: :destroy
  has_one :form_inbox, dependent: :destroy
  # « Territoire »: granted by Semisto from the admin (Admin::TeamsController),
  # never turned on by the team itself.
  has_many :territories, dependent: :destroy
  # « Collègue IA » (TeamAgent): granted by Semisto from the admin too. The
  # team brings its own API key, kept encrypted and never shown again.
  has_one :team_agent, dependent: :destroy
  has_many :agent_runs, dependent: :destroy
  encrypts :agent_api_key

  AGENT_PROVIDERS = %w[anthropic].freeze
  AGENT_BUDGET_MAX_CENTS = 100_000

  normalizes :name, with: ->(n) { n.to_s.squish }
  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH }
  validates :slug, presence: true, uniqueness: true
  validate :billing_user_is_admin, if: :billing_user_id
  validates :agent_provider, inclusion: { in: AGENT_PROVIDERS }
  validates :agent_monthly_budget_cents, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: AGENT_BUDGET_MAX_CENTS }
  before_save :keep_agent_key_hint, if: :will_save_change_to_agent_api_key?

  before_validation :assign_slug, on: :create

  # Creates the team with `user` as its first admin.
  def self.create_with_admin!(user, name:)
    transaction do
      create!(name:).tap { |team| team.memberships.create!(user:, role: "admin") }
    end
  end

  def territory_module? = territory_module_granted_at.present?

  def grant_territory_module!
    update!(territory_module_granted_at: Time.current) unless territory_module?
  end

  # The territories stay readable, read-only, until it is granted again:
  # nothing is taken hostage.
  def revoke_territory_module!
    update!(territory_module_granted_at: nil)
  end

  def agents_module? = agents_module_granted_at.present?

  def grant_agents_module!
    update!(agents_module_granted_at: Time.current) unless agents_module?
  end

  # The colleague stops answering; her sheet, her journal and what she wrote
  # stay.
  def revoke_agents_module!
    update!(agents_module_granted_at: nil)
  end

  # The team's colleague, when she can be asked something: the module is
  # granted, she exists and is not paused, and the team gave a key.
  def colleague
    return nil unless agents_module? && agent_api_key.present?
    team_agent if team_agent&.active?
  end

  # What the colleague cost this month, in millionths of a US dollar, and
  # whether the admin's ceiling still leaves room.
  def agent_spent_micros(time = Time.current) = agent_runs.in_month(time).sum(:cost_micros)
  def agent_budget_micros = agent_monthly_budget_cents * 10_000
  def agent_budget_left?(time = Time.current) = agent_spent_micros(time) < agent_budget_micros

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
    # « sk-ant-…a1B2 »: enough to recognise the key, never to use it.
    def keep_agent_key_hint
      key = agent_api_key.to_s
      self.agent_api_key = nil if key.blank?
      self.agent_api_key_hint = key.length >= 12 ? "#{key.first(7)}…#{key.last(4)}" : nil
    end

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
