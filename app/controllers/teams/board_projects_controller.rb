# A team map on the team board: its phase (dragged from one column to
# another), lead and crew, the date promised to the client, on hold or
# awake, closed (« Sans suite ») or reopened. A move may carry the project's
# next step, which becomes a dated task of the map (and an e-mail to the
# person it is given to). Any member of the team does it, as they all edit
# the team's maps. Answers with the board's view of the project; `show`
# gives it to the map editor (« Partager » dialog) with the team's people.
module Teams
  class BoardProjectsController < ApplicationController
    include TeamScoped

    FOLLOW_UP_LIST = "follow_up"

    before_action :set_team
    before_action :set_map
    before_action :require_writable, only: :update

    def show
      board = Teams::Board.new(@team, Current.user)
      render json: { project: board.project(@map), **board.settings }
    end

    def update
      task = nil
      Map.transaction do
        @map.update_board!(project_params)
        task = create_next_step! if params[:next_step].present?
      end
      TaskMailer.assigned(task, Current.user).deliver_later if task&.assignee && task.assignee != Current.user
      render json: { project: Teams::Board.new(@team, Current.user).project(@map.reload) }
    rescue ActiveRecord::RecordInvalid => e
      render json: { message: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    private
      def set_map
        @map = @team.maps.active.find(params[:id])
      end

      def require_writable
        render json: { message: t("maps.errors.read_only") }, status: :forbidden if @map.read_only_by_plan?
      end

      def project_params
        params.fetch(:project, {}).permit(:phase, :lead_id, :promised_on, :promised_what, :on_hold, :closed_reason, :closed_note, :reopen, crew_ids: [])
      end

      def create_next_step!
        step = params.require(:next_step).permit(:title, :assignee_id, :due_on)
        list = @map.task_lists.find_by(key: FOLLOW_UP_LIST) ||
               @map.task_lists.create!(key: FOLLOW_UP_LIST, name: t("team_board.follow_up_list"), created_by: Current.user)
        list.tasks.create!(map: @map, title: step[:title], assignee_id: step[:assignee_id].presence,
                           due_on: step[:due_on].presence, created_by: Current.user)
      end
  end
end
