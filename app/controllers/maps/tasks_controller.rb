# The tasks of a map (« Tâches »): a full page next to the map, and the
# JSON its writes answer with (the whole board, TaskBoard). The first visit
# adds Semisto's default lists (TaskList::Defaults). Everyone on the map
# reads; editors manage; the person a task is assigned to may tick it, even
# as a viewer. Giving a task to someone else e-mails them.
module Maps
  class TasksController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :set_task, only: %i[update destroy]
    before_action :require_editor!, except: %i[index update]
    before_action :require_editor_or_assignee!, only: :update

    def index
      TaskList::Defaults.seed!(@map, by: Current.user)
      board = TaskBoard.new(@map)
      respond_to do |format|
        format.html do
          render inertia: "maps/tasks/index", props: board.as_json.merge(
            map: { id: @map.id, name: @map.name, role: @role, teamId: @map.organization_id },
            participants: board.participants,
            canEdit: can_edit?,
            today: Date.current.iso8601
          )
        end
        format.json { render json: board }
      end
    end

    def create
      list = @map.task_lists.find(params.require(:task).require(:task_list_id))
      task = list.tasks.new(task_params.merge(map: @map, created_by: Current.user))
      task.completed_by = Current.user if task.completed_at
      if task.save
        notify_assignee(task) if task.assignee_id
        render json: { task: task.as_json, board: TaskBoard.new(@map) }, status: :created
      else
        render_errors task
      end
    end

    def update
      reassigned = false
      Task.transaction do
        @task.assign_attributes(editable_params)
        @task.completed_by = Current.user if @task.completed_at_changed? && @task.completed_at
        reassigned = @task.assignee_id_changed? && @task.assignee_id
        @task.save!
        move if params[:task]&.key?(:position) || params[:task]&.key?(:task_list_id)
      end
      notify_assignee(@task) if reassigned
      render json: { task: @task.as_json, board: TaskBoard.new(@map) }
    rescue ActiveRecord::RecordInvalid
      render_errors @task
    end

    def destroy
      @task.destroy!
      render json: { board: TaskBoard.new(@map) }
    end

    private
      def set_task
        @task = @map.tasks.find(params[:id])
      end

      def can_edit?
        %w[owner editor].include?(@role) && !@map.read_only_by_plan?
      end

      # A viewer ticks the tasks given to them, and nothing else.
      def require_editor_or_assignee!
        return require_editor! unless @task.assignee_id == Current.user.id && !can_edit?
        return if (params.require(:task).keys - %w[completed]).empty?
        render json: { message: t("maps.errors.read_only") }, status: :forbidden
      end

      def task_params
        params.require(:task).permit(:title, :notes, :assignee_id, :due_on, :completed, tags: [])
      end

      def editable_params
        can_edit? ? task_params : task_params.slice(:completed)
      end

      def move
        list = params[:task][:task_list_id].present? ? @map.task_lists.find(params[:task][:task_list_id]) : @task.task_list
        index = params[:task].key?(:position) ? params[:task][:position].to_i : list.tasks.size
        @task.move_to!(list, index)
      end

      def notify_assignee(task)
        return if task.assignee == Current.user
        TaskMailer.assigned(task, Current.user).deliver_later
      end
  end
end
