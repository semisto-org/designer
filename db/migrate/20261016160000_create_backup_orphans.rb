# Files the backup bucket still holds although the app deleted them, with the
# night they were first seen orphaned: FileStorage::Backup erases them from
# the backup once the privacy policy's delay has passed.
class CreateBackupOrphans < ActiveRecord::Migration[8.1]
  def change
    create_table :backup_orphans do |t|
      t.string :service_name, null: false
      t.string :key, null: false
      t.datetime :first_seen_at, null: false
    end
    add_index :backup_orphans, %i[service_name key], unique: true
  end
end
