# A vernacular name of a species, variety or genus, in one language.
class PlantCommonName < ApplicationRecord
  belongs_to :nameable, polymorphic: true

  normalizes :name, with: ->(n) { n.to_s.squish }

  validates :name, presence: true, length: { maximum: 120 }
  validates :language, presence: true, length: { maximum: 8 }
  validates :name, uniqueness: { scope: %i[nameable_type nameable_id language], case_sensitive: false }
end
