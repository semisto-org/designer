# A botanical genus (Malus, Ribes…). Optional parent of species.
class PlantGenus < ApplicationRecord
  self.table_name = "plant_genera"

  include FieldProvenance
  provenanced_fields :common_name

  has_many :species, class_name: "PlantSpecies", foreign_key: :genus_id, inverse_of: :genus, dependent: :nullify

  normalizes :latin_name, with: ->(n) { n.to_s.squish.capitalize }

  validates :latin_name, presence: true, uniqueness: { case_sensitive: false }, length: { maximum: 80 }

  def self.for_latin_name(latin_name)
    word = latin_name.to_s.squish.split.first
    return nil if word.blank? || word.match?(/\A[×x]\z/i)
    where("lower(latin_name) = ?", word.downcase).first || create!(latin_name: word)
  rescue ActiveRecord::RecordNotUnique
    retry
  end
end
