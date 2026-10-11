module Mcp
  module Tools
    # Changes tasks of a map: ticks or unticks them, renames them, moves them
    # to another list, gives them to someone, sets or clears a due date,
    # retags them. Only the fields passed change; null clears a due date or
    # an assignee. Editors change everything; a viewer only ticks the tasks
    # given to them, as on the page. Nothing is deleted from here.
    class UpdateTasks < Base
      include TaskHelpers

      FIELDS = %w[title notes due_on assignee_id tags completed list_id].freeze

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          tasks: {
            type: "array", minItems: 1, maxItems: TaskHelpers::MAX_TASKS, description: :task_changes,
            items: {
              type: "object", additionalProperties: false, required: %w[task_id], minProperties: 2,
              properties: {
                task_id: { type: "integer", minimum: 1, description: :task_id },
                completed: { type: "boolean", description: :completed },
                title: { type: "string", minLength: 1, maxLength: Task::TITLE_MAX_LENGTH, description: :task_title },
                notes: { type: [ "string", "null" ], maxLength: Task::NOTES_MAX_LENGTH, description: :task_notes },
                list_id: { type: "integer", minimum: 1, description: :move_to_list },
                due_on: { type: [ "string", "null" ], format: "date", description: :due_on_change },
                assignee_id: { type: [ "integer", "null" ], minimum: 1, description: :assignee_change },
                tags: {
                  type: "array", maxItems: MapFeature::Tags::MAX_TAGS, uniqueItems: true, description: :tags_change,
                  items: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH }
                }
              }
            }
          }
        },
        required: %w[map_id tasks]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, tasks:)
        map = find_map!(map_id)
        require_write!(map, role: false)
        updated = []
        rejected = []
        tasks.each_with_index do |line, index|
          line = line.to_h.transform_keys(&:to_s)
          task = map.tasks.find_by(id: line["task_id"]) or raise Invalid, t("errors.task_not_found", id: line["task_id"])
          reassigned = apply(map, task, line)
          updated << task
          notify_assignee(task) if reassigned
        rescue Invalid => e
          rejected << { index:, task_id: line["task_id"], error: e.message }
        rescue ActiveRecord::RecordInvalid => e
          rejected << { index:, task_id: line["task_id"], error: e.record.errors.full_messages.to_sentence }
        end
        if updated.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        done = journey_done(map)
        { updated: updated.map { task_json(_1.reload, done) }, rejected:, url: "#{map_url(map)}/tasks" }
      end

      private
        # Applies one line; true when the task now goes to someone new.
        def apply(map, task, line)
          changes = line.slice(*FIELDS)
          unless editor?
            raise Invalid, t("errors.tick_own_only") unless task.assignee_id == user.id && changes.keys == %w[completed]
          end
          reassigned = false
          Task.transaction do
            task.title = changes["title"] if changes.key?("title")
            task.notes = changes["notes"] if changes.key?("notes")
            task.due_on = parse_due_on(changes["due_on"]) if changes.key?("due_on")
            task.assignee_id = changes["assignee_id"] if changes.key?("assignee_id")
            task.tags = Array(changes["tags"]) if changes.key?("tags")
            if changes.key?("completed")
              task.completed = changes["completed"]
              task.completed_by = user if task.completed_at_changed? && task.completed_at
            end
            reassigned = task.assignee_id_changed? && task.assignee_id.present?
            task.save!
            if changes.key?("list_id") && changes["list_id"] != task.task_list_id
              list = map.task_lists.find_by(id: changes["list_id"]) or raise Invalid, t("errors.task_list_not_found", id: changes["list_id"])
              task.move_to!(list, list.tasks.size)
            end
          end
          reassigned
        end

        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], tasks: Array(arguments[:tasks]).size }
        end

        def summarize_result(data) = { updated: data[:updated].size, rejected: data[:rejected].size }
    end
  end
end
