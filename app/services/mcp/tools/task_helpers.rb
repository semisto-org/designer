module Mcp
  module Tools
    # What the task tools share: a task as the AI reads it, and what this
    # connection may do with the tasks of the map.
    module TaskHelpers
      include PlantLookup

      MAX_TASKS = 50
      # A line of a call the AI must correct (unknown list, unreadable date,
      # a plant not on the map…).
      Invalid = PlantLookup::Invalid

      private
        # `done`: the journey items the map shows done (a default task whose
        # work the map already shows, « La carte le montre »).
        def task_json(task, done = [])
          journey = TaskList::Defaults.journey_for(task.key)
          panel = task.panel
          {
            id: task.id, list_id: task.task_list_id, list: task.task_list.name,
            title: task.title, notes: task.notes, tags: task.tags.presence,
            due_on: task.due_on&.iso8601, overdue: task.overdue? || nil,
            assignee: (task.assignee && { id: task.assignee.id, name: task.assignee.display_name }) ||
                      (task.invitee_email && { email: task.invitee_email, invited: true }),
            done: task.done?, completed_at: task.completed_at&.iso8601, completed_by: task.completed_by&.display_name,
            semisto_default: task.key.present? || nil,
            map_says_done: journey ? done.include?(journey) : nil,
            open_in_map: panel && "#{map_url(task.map)}?panel=#{panel}",
            features: task.features.any? ? task.features_json.map { |f| f.merge(url: "#{map_url(task.map)}?feature=#{f[:id]}") } : nil
          }.compact
        end

        # The elements a task line is about: any element of the map by id
        # (feature_ids), plants also by their number on the plan (numbers).
        # nil when the line names none.
        def features_for(map, line)
          return nil unless line.key?("feature_ids") || line.key?("numbers")
          ids = Array(line["feature_ids"]).map(&:to_i)
          numbers = Array(line["numbers"]).compact_blank
          found = map.features.where.not(status: "rejected").where(id: ids).to_a
          missing = ids - found.map(&:id)
          raise Invalid, t("task_errors.features_not_found", ids: missing.map { "##{_1}" }.join(", ")) if missing.any?
          found += plants_for(map, { "numbers" => numbers }) if numbers.any?
          raise Invalid, t("task_errors.too_many_features", max: Task::MAX_FEATURES) if found.uniq.size > Task::MAX_FEATURES
          found.uniq
        end

        # Editors manage every task; a viewer only ticks the tasks given to them.
        def task_permissions
          blockers = write_blockers(@map, role: false)
          {
            manage: blockers.empty? && editor?,
            tick_own_tasks: blockers.empty?,
            blocked_by: (blockers + (editor? ? [] : [ "role_tasks" ])).map { |b| t("permissions.#{b}") }.presence
          }.compact
        end

        # The journey items the map shows done, for map_says_done.
        def journey_done(map)
          Journey.new(map).items.select(&:done).map(&:key)
        rescue StandardError => e
          # The journey reads many areas of the map; the tasks must not fail with it.
          Rails.error.report(e, handled: true)
          []
        end

        def notify_assignee(task)
          return unless task.assigned?
          return if task.assignee_id == user.id
          TaskMailer.assigned(task, user).deliver_later
        end

        # A date given as YYYY-MM-DD, or an error.
        def parse_due_on(value)
          return nil if value.nil?
          Date.iso8601(value.to_s)
        rescue Date::Error
          raise Invalid, t("task_errors.due_on", value:)
        end
    end
  end
end
