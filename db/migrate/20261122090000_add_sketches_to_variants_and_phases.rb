# Several designers sketching one place: a variant knows who started it
# (« Esquisse de Julie »), and a phase put away keeps every variant of its
# time, not only the retained one.
class AddSketchesToVariantsAndPhases < ActiveRecord::Migration[8.1]
  def change
    add_reference :map_variants, :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
    add_column :map_phases, :variants, :jsonb, default: [], null: false
  end
end
