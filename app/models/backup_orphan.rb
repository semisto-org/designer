# A file of the backup bucket that no blob refers to any more (see
# FileStorage::Backup#purge_orphans).
class BackupOrphan < ApplicationRecord
  validates :service_name, :key, :first_seen_at, presence: true
end
