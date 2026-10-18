# How much room the files of a payer's maps take (Entitlements#storage_bytes):
# photos and videos, documents, soil reports, plant observation photos, plan
# images and the aerial views a user imported, on every map their plan pays
# for, archived ones included. Thumbnails, image variants, the terrain data
# Terranova computes and the drone views Semisto delivers are not counted.
class StorageUsage
  # Record type => [attachment names counted, scope of the records counted].
  COUNTED = {
    "MapPhoto" => [ %w[image], -> { MapPhoto.all } ],
    "MapDocument" => [ %w[file], -> { MapDocument.all } ],
    "SoilSample" => [ %w[lab_reports], -> { SoilSample.all } ],
    "PlantObservation" => [ %w[photo], -> { PlantObservation.all } ],
    "PlanImage" => [ %w[image], -> { PlanImage.all } ],
    "AerialView" => [ %w[archive], -> { AerialView.imported } ]
  }.freeze

  attr_reader :payer

  def initialize(payer)
    @payer = payer
  end

  def self.for_map(map) = new(map.billing_user)

  def used_bytes
    @used_bytes ||= begin
      maps = payer.billed_maps(archived: true).select(:id)
      attachments = COUNTED.map do |type, (names, records)|
        ActiveStorage::Attachment.where(record_type: type, name: names, record_id: records.call.where(map_id: maps).select(:id))
      end.reduce(:or)
      ActiveStorage::Blob.where(id: attachments.select(:blob_id)).sum(:byte_size)
    end
  end

  # nil: no limit (billing off).
  def limit_bytes = Entitlements.for(payer).storage_bytes

  def allows?(incoming_bytes)
    limit_bytes.nil? || used_bytes + incoming_bytes.to_i <= limit_bytes
  end

  # Said when an upload is refused.
  def self.full_message(usage)
    I18n.t("billing.storage.full", limit: ActiveSupport::NumberHelper.number_to_human_size(usage.limit_bytes, locale: :fr))
  end

  def as_json(*) = { usedBytes: used_bytes, limitBytes: limit_bytes }
end
