# What the open pages say about one value of a proposed species, as Jev read
# them (Catalog::ValueCheck): « confirmed », « partial » (a list or months the
# pages confirm in part), « contradicted » (a page states `source_value`
# instead) or « unknown » (no page says). `excerpt` is the sentence that
# proves it, kept only for pages that may be quoted (Wikipédia, never PFAF).
class PlantValueCheck < ApplicationRecord
  VERDICTS = %w[confirmed partial contradicted unknown].freeze

  belongs_to :species, class_name: "PlantSpecies", inverse_of: :value_checks

  validates :field, presence: true, uniqueness: { scope: :species_id }
  validates :verdict, inclusion: { in: VERDICTS }

  def as_json(*)
    { field:, verdict:, sourceValue: source_value, confidence:, source:, url:, excerpt: }
  end
end
