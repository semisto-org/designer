# A record whose files count against its map's storage allowance
# (StorageUsage). A new record whose files would go beyond it is refused, with
# a message that says how to get room. Files Terranova or Semisto add
# themselves (imports, painted images, form answers) set
# `skip_storage_quota` and are never refused.
module CountsTowardStorage
  extend ActiveSupport::Concern

  included do
    attr_accessor :skip_storage_quota
    validate :within_storage_quota, on: :create, unless: :skip_storage_quota
  end

  # Bytes of the files being attached by this save.
  def incoming_storage_bytes
    attachment_changes.values.sum do |change|
      blobs = change.respond_to?(:blobs) ? change.blobs : [ change.try(:blob) ]
      blobs.compact.sum(&:byte_size)
    end
  end

  private
    def within_storage_quota
      return unless map && Billing.enabled?
      usage = StorageUsage.for_map(map)
      return if usage.allows?(incoming_storage_bytes)
      errors.add(:base, :storage_full, message: StorageUsage.full_message(usage))
    end
end
