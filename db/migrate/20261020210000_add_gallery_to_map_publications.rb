# « Carnets ouverts »: published maps Semisto shows on the public site, only
# those whose owner offered them (options["in_gallery"]). One of them can be
# the map the features page visits.
class AddGalleryToMapPublications < ActiveRecord::Migration[8.1]
  def change
    add_column :map_publications, :gallery_position, :integer
    add_column :map_publications, :site_tour, :boolean, default: false, null: false
    add_index :map_publications, :gallery_position
    add_index :map_publications, :site_tour, unique: true, where: "site_tour"
  end
end
