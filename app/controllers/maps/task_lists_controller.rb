# The task lists of a map: create, rename, reorder and delete them, and put
# Semisto's default lists back (`defaults`). Editors only; every write
# answers with the whole board (TaskBoard).
module Maps
  class TaskListsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!
    before_action :set_list, only: %i[update destroy]

    def create
      list = @map.task_lists.new(list_params.merge(created_by: Current.user))
      if list.save
        render json: { list:, board: TaskBoard.new(@map) }, status: :created
      else
        render_errors list
      end
    end

    def update
      TaskList.transaction do
        @list.update!(list_params) if params[:task_list]&.key?(:name)
        @list.move_to!(params[:task_list][:position]) if params[:task_list]&.key?(:position)
      end
      render json: { list: @list, board: TaskBoard.new(@map) }
    rescue ActiveRecord::RecordInvalid
      render_errors @list
    end

    def destroy
      @list.destroy!
      render json: { board: TaskBoard.new(@map) }
    end

    # « Ajouter les tâches de Semisto »: the default lists the map lacks.
    def defaults
      @map.with_lock do
        TaskList::Defaults.add_missing!(@map, by: Current.user)
        @map.update_column(:tasks_seeded_at, Time.current) unless @map.tasks_seeded_at
      end
      render json: { board: TaskBoard.new(@map) }
    end

    private
      def set_list
        @list = @map.task_lists.find(params[:id])
      end

      def list_params
        params.require(:task_list).permit(:name)
      end
  end
end
