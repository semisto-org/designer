# One upstream record brought into a map by an import (Imports::Claudy):
# where it came from (source, type, id), what it became in Designer
# (`record`, possibly deleted since) and the fingerprint of the values the
# import wrote. See Imports::Claudy::Importer for how a re-run uses it.
class ImportRecord < ApplicationRecord
  belongs_to :map
  belongs_to :record, polymorphic: true, optional: true

  validates :source, :external_type, :external_id, :imported_at, presence: true
  validates :external_id, uniqueness: { scope: %i[map_id source external_type] }

  scope :from_source, ->(source) { where(source: source.to_s) }

  # The Designer record is gone (deleted there after the import).
  def record_missing? = record_id.present? && record.nil?
end
