class CreateMapPhotos < ActiveRecord::Migration[8.1]
  def change
    # Simple albums to sort the photos of a map (« Verger, avant travaux »).
    create_table :photo_albums do |t|
      t.references :map, null: false, foreign_key: true
      t.string :name, null: false
      t.text :description
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    # A photo taken on (or about) the terrain. The file is an Active Storage
    # attachment (`image`); everything else is what the map needs to place it.
    create_table :map_photos do |t|
      t.references :map, null: false, foreign_key: true
      t.references :uploaded_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :photo_album, foreign_key: { on_delete: :nullify }
      # Optional link to a thing drawn on the map (a tree, a pond, a zone…).
      t.references :map_feature, foreign_key: { on_delete: :nullify }
      t.datetime :taken_at
      # Where the photo was taken (EXIF GPS, phone position or a click on the
      # map). Null while the photo still has to be placed.
      t.st_point :location, srid: 4326
      # exif | device | map | manual
      t.string :location_source
      # Compass direction the camera was facing, 0-360 degrees (north = 0).
      t.float :heading
      t.string :caption, limit: 500
      # web | phone | import
      t.string :source, null: false, default: "web"
      # MD5 of the file: the same photo is not imported twice on one map.
      t.string :checksum
      t.timestamps
    end
    add_index :map_photos, :location, using: :gist
    # « Photos within N meters »: ST_DWithin on the geography type.
    add_index :map_photos, "(location::geography)", using: :gist, name: "index_map_photos_on_location_geography"
    add_index :map_photos, [ :map_id, :taken_at ]
    add_index :map_photos, [ :map_id, :checksum ], unique: true, where: "checksum IS NOT NULL"
  end
end
