# The team board (« Tableau de l'équipe »): where each team map stands in
# the life of a project (from the first request to completion), who leads
# it and who works on it, the date promised to the client, and the season's
# steps (design, work site, planting) kept as dated tasks of the map.
class AddTeamBoard < ActiveRecord::Migration[8.1]
  def change
    change_table :maps, bulk: true do |t|
      t.string :phase
      t.datetime :phase_changed_at
      t.references :lead, foreign_key: { to_table: :users, on_delete: :nullify }
      t.date :promised_on
      t.string :promised_what
      t.datetime :on_hold_since
      t.datetime :closed_at
      t.string :closed_reason
      t.string :closed_note
    end

    create_table :map_assignments do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.datetime :created_at, null: false
      t.index %i[map_id user_id], unique: true
    end

    change_table :tasks, bulk: true do |t|
      t.date :starts_on
      t.string :step_kind
    end

    add_column :project_requests, :decline_note, :string
  end
end
