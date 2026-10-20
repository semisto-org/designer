# « Et chez toi ? »: a trial map started from an address on a public view,
# without an account, kept 48 hours and adopted when its visitor signs up;
# and where each new account came from (the public view that brought it).
class CreateMapTrials < ActiveRecord::Migration[8.1]
  def change
    create_table :map_trials do |t|
      t.string :token, null: false, index: { unique: true }
      t.string :address
      t.st_point :center, srid: 4326, null: false
      t.multi_polygon :boundary, srid: 4326
      t.jsonb :parcels, default: [], null: false
      t.float :area_m2
      t.jsonb :reading, default: {}, null: false
      t.references :region, foreign_key: true
      t.references :source_publication, foreign_key: { to_table: :map_publications, on_delete: :nullify }
      t.references :adopted_map, foreign_key: { to_table: :maps, on_delete: :nullify }
      t.datetime :expires_at, null: false, index: true
      t.timestamps
    end

    add_reference :users, :source_publication, foreign_key: { to_table: :map_publications, on_delete: :nullify }
    add_column :map_publications, :views_count, :integer, default: 0, null: false
  end
end
