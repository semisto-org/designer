# Where an imported line came from (« my.semisto.org/recordings/10639 »), so
# an import run twice notes each line once.
class AddExternalRefToTimeEntries < ActiveRecord::Migration[8.1]
  def change
    add_column :time_entries, :external_ref, :string
    add_index :time_entries, [ :map_id, :external_ref ], unique: true, where: "external_ref IS NOT NULL"
  end
end
