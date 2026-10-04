class CreateImportRecords < ActiveRecord::Migration[8.1]
  def change
    # The ledger of one-shot imports into a map (first: Claudy, the app of
    # Les 4 Sources). One row per upstream record: what it became in Designer
    # (`record`, which may since have been deleted there) and a fingerprint of
    # the values the import wrote, so a re-run updates what nobody touched,
    # keeps what was edited in Designer and never brings back what was
    # deleted there.
    create_table :import_records do |t|
      t.references :map, null: false, index: false, foreign_key: { on_delete: :cascade }
      # "claudy"
      t.string :source, null: false
      # Upstream type and id: "map_feature" 12, "plant" 7, "photo" 31…
      t.string :external_type, null: false
      t.string :external_id, null: false
      # What the upstream record became (MapFeature, MapPhoto,
      # BioindicatorObservation). No foreign key: several tables.
      t.references :record, polymorphic: true, index: true
      # SHA-256 of the record as the import left it.
      t.string :digest
      t.datetime :imported_at, null: false
      t.timestamps
    end
    add_index :import_records, %i[map_id source external_type external_id], unique: true, name: "index_import_records_on_upstream"
  end
end
