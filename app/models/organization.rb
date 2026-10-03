# A team owning maps (Semisto first). Members edit every map of the team
# without counting against the three-editor limit of a map.
class Organization < ApplicationRecord
  has_many :memberships, class_name: "OrganizationMembership", dependent: :destroy
  has_many :users, through: :memberships
  has_many :maps, dependent: :nullify

  validates :name, :slug, presence: true
  validates :slug, uniqueness: true

  before_validation { self.slug ||= name&.parameterize }
end
