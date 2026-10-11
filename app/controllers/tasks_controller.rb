# /tasks: the tasks still to do across maps, in one place. « À moi »: the
# tasks given to me on every map I take part in. « Équipe … »: every task
# of a team's maps, for the team that runs its projects in Designer.
# Ticking goes through Maps::TasksController.
class TasksController < ApplicationController
  def index
    teams = Current.user.organizations.order(:name, :id).to_a
    team = teams.find { |t| t.id == params[:team_id].to_i } if params[:team_id].present?
    tasks = team ? team_tasks(team) : my_tasks
    render inertia: "tasks/index", props: {
      scope: team ? { type: "team", id: team.id, name: team.name } : { type: "me" },
      teams: teams.map { |t| { id: t.id, name: t.name } },
      tasks: tasks.map { |task| task.as_json.merge(map: { id: task.map_id, name: task.map.name }, listName: task.task_list.name) },
      today: Date.current.iso8601
    }
  end

  private
    def my_maps
      Map.active.where(id: Current.user.map_memberships.select(:map_id))
         .or(Map.active.where(organization_id: Current.user.organization_memberships.select(:organization_id)))
    end

    def my_tasks
      pending_in(my_maps).where(assignee: Current.user)
    end

    def team_tasks(team)
      pending_in(Map.active.where(organization_id: team.id))
    end

    def pending_in(maps)
      Task.pending.where(map_id: maps.select(:id))
          .includes(:map, :task_list, :assignee)
          .order(Arel.sql("tasks.due_on ASC NULLS LAST"), :map_id, :position, :id)
    end
end
