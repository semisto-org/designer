# The tasks of a map (« Tâches »): a full page next to the map, and the
# JSON its writes answer with (the whole board, TaskBoard). The first visit
# adds Semisto's default lists (TaskList::Defaults). Everyone on the map
# reads; editors manage; the person a task is assigned to may tick it, even
# as a viewer. Giving a task to someone else e-mails them; someone invited
# who has no account yet gets their invitation link with it. A task may be
# about elements of the map (feature_ids); `?feature_id=` lists the tasks
# of one element, for its sheet in the editor.
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
            map: { id: @map.id, name: @map.name, role: @role, teamId: @map.organization_id,
                   offerBuilder: Offer.shown_to?(@map, Current.user) },
            participants: board.participants,
            canEdit: can_edit?,
            today: Date.current.iso8601
          )
        end
        format.json do
          next render json: board unless params[:feature_id].present?
          tasks = @map.tasks.about(params[:feature_id].to_i).includes(:assignee, :completed_by, :features).order(:completed_at, :due_on, :id)
          render json: { tasks: tasks.map(&:as_json), lists: @map.task_lists.map(&:as_json) }
        end
      end
    end

    def create
      list = @map.task_lists.find(params.require(:task).require(:task_list_id))
      task = list.tasks.new(task_params.except(:feature_ids).merge(map: @map, created_by: Current.user))
      task.features = linked_features if task_params.key?(:feature_ids)
      task.completed_by = Current.user if task.completed_at
      if task.save
        notify_assignee(task) if task.assigned?
        render json: { task: task.as_json, board: TaskBoard.new(@map) }, status: :created
      else
        render_errors task
      end
    end

    def update
      reassigned = false
      Task.transaction do
        attributes = editable_params
        @task.assign_attributes(attributes.except(:feature_ids))
        @task.features = linked_features if attributes.key?(:feature_ids)
        @task.completed_by = Current.user if @task.completed_at_changed? && @task.completed_at
        reassigned = (@task.assignee_id_changed? && @task.assignee_id) || (@task.invitee_email_changed? && @task.invitee_email)
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
        params.require(:task).permit(:title, :notes, :assignee_id, :invitee_email, :due_on, :completed, tags: [], feature_ids: [])
      end

      def editable_params
        can_edit? ? task_params : task_params.slice(:completed)
      end

      # The elements of this map the task is about; ids of another map are
      # left out.
      def linked_features
        ids = Array(task_params[:feature_ids]).compact_blank.map(&:to_i).first(Task::MAX_FEATURES)
        @map.features.where.not(status: "rejected").where(id: ids).to_a
      end

      def move
        list = params[:task][:task_list_id].present? ? @map.task_lists.find(params[:task][:task_list_id]) : @task.task_list
        index = params[:task].key?(:position) ? params[:task][:position].to_i : list.tasks.size
        @task.move_to!(list, index)
      end

      def notify_assignee(task)
        return if task.assignee_id && task.assignee == Current.user
        TaskMailer.assigned(task, Current.user).deliver_later
      end
  end
end
