# What readers say about the help center: a « Ce guide t'a aidé ? » answer per
# article (with an optional comment), and the searches that found nothing.
class CreateHelpFeedback < ActiveRecord::Migration[8.1]
  def change
    create_table :help_feedbacks do |t|
      t.string :slug, null: false
      t.boolean :helpful, null: false
      t.text :comment
      t.references :user, foreign_key: { on_delete: :nullify }
      t.timestamps
    end
    add_index :help_feedbacks, [ :slug, :created_at ]

    create_table :help_search_misses do |t|
      t.string :query, null: false
      t.integer :count, null: false, default: 1
      t.datetime :last_searched_at, null: false
      t.timestamps
    end
    add_index :help_search_misses, :query, unique: true
  end
end
