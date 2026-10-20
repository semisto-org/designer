# The beta's « Premières heures »: what testers tell us (« Un retour ? »),
# whether they let Sentry record their first sessions, and two moments of a
# place that nothing dated before: its outline drawn, its plan printed.
class AddFirstHourTracking < ActiveRecord::Migration[8.1]
  def change
    create_table :feedbacks do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.references :map, foreign_key: { on_delete: :nullify }
      t.text :message, null: false
      t.string :path
      t.boolean :wants_call, null: false, default: false
      t.string :sentry_replay_id
      t.timestamps
      t.index :created_at
    end

    # null: not asked yet; true or false: the answer, given at replay_consent_at.
    add_column :users, :replay_consent, :boolean
    add_column :users, :replay_consent_at, :datetime

    create_table :session_replays do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.string :replay_id, null: false
      t.string :path
      t.timestamps
      t.index %i[user_id replay_id], unique: true
    end

    add_column :maps, :outlined_at, :datetime
    add_column :maps, :plan_printed_at, :datetime
  end
end
