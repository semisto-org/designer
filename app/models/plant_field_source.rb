# Provenance of ONE value of the catalogue: which source it comes from (and
# through which upstream source), under which licence, at which URL, and
# whether a human checked it against that source.
#
#   source "trefle", upstream_source "usda", license "domaine public US"
#   source "pfaf" → shown « Source : PFAF » (values only, never PFAF texts)
class PlantFieldSource < ApplicationRecord
  STATUSES = %w[sourced to_verify empty].freeze

  belongs_to :record, polymorphic: true

  validates :field, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :source, presence: true, format: { with: PlantSource::FORMAT }
  validates :upstream_source, format: { with: PlantSource::FORMAT }, allow_blank: true
  validates :url, format: { with: %r{\Ahttps?://\S+\z} }, allow_blank: true
  validates :field, uniqueness: { scope: %i[record_type record_id] }

  def as_json(*)
    {
      source:, upstreamSource: upstream_source, license: license.presence || PlantSource.default_license(source),
      url:, status:, updatedAt: updated_at&.iso8601
    }
  end
end
