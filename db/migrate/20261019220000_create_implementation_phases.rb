# The implementation plan of a map (« Mise en œuvre »): the phases in which
# the design is built, each with its working season (starts_on..ends_on),
# notes, and the person's own estimates (hours_override replaces the
# computed workload; other_costs_cents adds to the plants' cost). Elements
# of the map join a phase through `properties.phase_id`. An AI proposes
# phases as drafts (status draft, source ai, rationale): the elements it
# would put in one wait in proposed_feature_ids until a human accepts it.
class CreateImplementationPhases < ActiveRecord::Migration[8.1]
  def change
    create_table :implementation_phases do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.string :key
      t.integer :position, null: false, default: 0
      t.date :starts_on, null: false
      t.date :ends_on, null: false
      t.text :notes
      t.integer :hours_override
      t.integer :other_costs_cents
      t.string :status, null: false, default: "active"
      t.string :source, null: false, default: "human"
      t.text :rationale
      t.bigint :proposed_feature_ids, array: true, null: false, default: []
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :implementation_phases, [ :map_id, :position ]
  end
end
