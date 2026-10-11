module Mcp
  module Tools
    # Adds tasks to a map's « Tâches », in an existing list (list_id) or in
    # a list found or made by its name (list_name). Tasks are the team's
    # to-do list, not the design: the AI writes them directly, like a
    # teammate, and the journal keeps the trace. A task given to someone
    # else e-mails them, as on the page.
    class CreateTasks < Base
      include TaskHelpers

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          tasks: {
            type: "array", minItems: 1, maxItems: TaskHelpers::MAX_TASKS, description: :tasks,
            items: {
              type: "object", additionalProperties: false, required: %w[title],
              properties: {
                list_id: { type: "integer", minimum: 1, description: :list_id },
                list_name: { type: "string", minLength: 1, maxLength: TaskList::NAME_MAX_LENGTH, description: :list_name },
                title: { type: "string", minLength: 1, maxLength: Task::TITLE_MAX_LENGTH, description: :task_title },
                notes: { type: "string", maxLength: Task::NOTES_MAX_LENGTH, description: :task_notes },
                due_on: { type: "string", format: "date", description: :due_on },
                assignee_id: { type: "integer", minimum: 1, description: :assignee_id },
                tags: {
                  type: "array", maxItems: MapFeature::Tags::MAX_TAGS, uniqueItems: true, description: :task_tags,
                  items: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH }
                }
              }
            }
          }
        },
        required: %w[map_id tasks]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, tasks:)
        map = find_map!(map_id)
        require_write!(map)
        TaskList::Defaults.seed!(map, by: user)
        created = []
        rejected = []
        tasks.each_with_index do |line, index|
          line = line.to_h.transform_keys(&:to_s)
          task = build(map, line)
          if task.save
            created << task
          else
            rejected << { index:, title: line["title"], error: task.errors.full_messages.to_sentence }
          end
        rescue Invalid => e
          rejected << { index:, title: line["title"], error: e.message }
        end
        if created.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        created.each { notify_assignee(_1) }
        {
          created: created.map { task_json(_1.reload) },
          rejected:,
          url: "#{map_url(map)}/tasks",
          next_step: t(created.any?(&:assignee_id) ? "notes.tasks_assigned" : "notes.tasks_written")
        }
      end

      private
        def build(map, line)
          map.tasks.new(
            task_list: list_for(map, line), created_by: user,
            title: line["title"], notes: line["notes"], due_on: parse_due_on(line["due_on"]),
            assignee_id: line["assignee_id"], tags: Array(line["tags"])
          )
        end

        # The list named by id, or by name (found regardless of case, else
        # created at the end of the board).
        def list_for(map, line)
          if line["list_id"]
            map.task_lists.find_by(id: line["list_id"]) or raise Invalid, t("errors.task_list_not_found", id: line["list_id"])
          elsif (name = line["list_name"].to_s.squish).present?
            map.task_lists.find_by("lower(name) = lower(?)", name) || map.task_lists.create!(name:, created_by: user)
          else
            raise Invalid, t("task_errors.no_list")
          end
        end

        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], tasks: Array(arguments[:tasks]).size }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end
