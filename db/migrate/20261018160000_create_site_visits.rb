# A walk on the land with the phone (« visite de terrain »): the notes taken
# on the way are note points of the map that carry the visit's key, and
# closing the visit files its report in the map's documents. The phone
# makes the key, so a visit begun without network is the same visit once
# its notes reach the server.
class CreateSiteVisits < ActiveRecord::Migration[8.1]
  def change
    create_table :site_visits do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :user, foreign_key: { on_delete: :nullify }
      t.string :key, null: false
      t.datetime :started_at, null: false
      t.datetime :ended_at
      t.references :map_document, foreign_key: { on_delete: :nullify }
      t.timestamps
    end
    add_index :site_visits, %i[map_id key], unique: true
    add_index :site_visits, %i[map_id started_at]
  end
end
