# Project variants of a map (« Projet 1 », « Projet 2 »): what is still a
# project belongs either to every variant (variant_id null) or to one of
# them. One variant is retained per map: the palette, the quantities, the
# offer, the implementation plan, the 3D view and the public map count only
# the common project and that variant.
class CreateMapVariants < ActiveRecord::Migration[8.1]
  def change
    create_table :map_variants do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.text :notes
      t.integer :position, null: false, default: 0
      t.boolean :retained, null: false, default: false
      t.timestamps
    end
    add_index :map_variants, :map_id, unique: true, where: "retained", name: "index_map_variants_one_retained"

    add_reference :map_features, :variant, foreign_key: { to_table: :map_variants, on_delete: :nullify }, index: true
  end
end
