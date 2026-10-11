module Mcp
  module Tools
    # The « Tâches » of a map: its lists, its tasks (who, when, done or not)
    # and the people a task can be given to. Like the page, the first read
    # adds Semisto's default lists (TaskList::Defaults), so the AI sees the
    # board the people see.
    class ListTasks < Base
      include TaskHelpers

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          list_id: { type: "integer", minimum: 1, description: :list_id },
          status: { type: "string", enum: %w[pending done all], default: "all", description: :task_status },
          assignee: { type: "string", enum: %w[me anyone nobody], default: "anyone", description: :assignee },
          tag: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH, description: :task_tag }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, list_id: nil, status: "all", assignee: "anyone", tag: nil)
        map = find_map!(map_id)
        TaskList::Defaults.seed!(map, by: user)
        lists = map.task_lists.reload.to_a
        raise ToolError, t("errors.task_list_not_found", id: list_id) if list_id && lists.none? { _1.id == list_id }
        scope = map.tasks.includes(:assignee, :completed_by, :task_list)
        scope = scope.where(task_list_id: list_id) if list_id
        scope = scope.pending if status == "pending"
        scope = scope.done if status == "done"
        scope = scope.where(assignee: user) if assignee == "me"
        scope = scope.where(assignee_id: nil) if assignee == "nobody"
        scope = scope.tagged(tag) if tag
        tasks = scope.to_a.sort_by { |task| [ lists.index { _1.id == task.task_list_id }, task.position, task.id ] }
        done = journey_done(map)
        all = map.tasks
        {
          lists: lists.map { |list| { id: list.id, name: list.name, default: list.key.present? } },
          tasks: tasks.map { |task| task_json(task, done) },
          count: tasks.size,
          totals: { pending: all.pending.count, done: all.done.count, overdue: all.overdue.count },
          tags: map.tasks.tag_counts,
          participants: TaskBoard.new(map).participants,
          today: Date.current.iso8601,
          url: "#{map_url(map)}/tasks",
          can: task_permissions
        }
      end

      private
        def summarize_result(data) = { tasks: data[:count] }
    end
  end
end
