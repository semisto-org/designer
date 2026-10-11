# The to-do side of a design project (« Tâches »): lists of tasks per map,
# each task with an optional assignee (a participant of the map), a due date
# and free tags. `key` marks the lists and tasks Semisto adds by default, so
# a task can point to the editor panel where it is done; the person may
# rename or delete them like any other. `maps.tasks_seeded_at` records that
# the default lists were added once, so deleting them never brings them back.
class CreateTaskListsAndTasks < ActiveRecord::Migration[8.1]
  def change
    create_table :task_lists do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.string :key
      t.integer :position, null: false, default: 0
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.timestamps
    end

    create_table :tasks do |t|
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      t.references :task_list, null: false, foreign_key: { on_delete: :cascade }
      t.string :title, null: false
      t.text :notes
      t.string :key
      t.integer :position, null: false, default: 0
      t.references :assignee, foreign_key: { to_table: :users, on_delete: :nullify }
      t.date :due_on
      t.datetime :completed_at
      t.references :completed_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.string :tags, array: true, null: false, default: []
      t.references :created_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.timestamps
    end
    add_index :tasks, [ :task_list_id, :position ]
    add_index :tasks, [ :assignee_id, :completed_at ]

    add_column :maps, :tasks_seeded_at, :datetime
  end
end
