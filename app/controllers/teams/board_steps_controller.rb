# The season's steps on the team board's timeline (design, work site,
# planting), kept as tasks of the map with a start and a due date: drawn,
# moved and stretched from the board. Answers with the step.
module Teams
  class BoardStepsController < ApplicationController
    include TeamScoped

    SEASON_LIST = "season"

    before_action :set_team
    before_action :set_step, only: %i[update destroy]

    def create
      map = @team.maps.active.find(params.require(:step).require(:map_id))
      return render_read_only if map.read_only_by_plan?
      list = map.task_lists.find_by(key: SEASON_LIST) ||
             map.task_lists.create!(key: SEASON_LIST, name: t("team_board.season_list"), created_by: Current.user)
      kind = step_params[:step_kind]
      task = list.tasks.create!(step_params.merge(map:, created_by: Current.user, title: step_params[:title].presence || t("team_board.steps.#{kind}", default: kind.to_s)))
      render json: { step: Teams::Board.step_json(task) }, status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { message: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    def update
      @step.update!(step_params)
      render json: { step: Teams::Board.step_json(@step) }
    rescue ActiveRecord::RecordInvalid => e
      render json: { message: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    def destroy
      @step.destroy!
      head :no_content
    end

    private
      def set_step
        @step = Task.steps.where(map_id: @team.maps.active.select(:id)).find(params[:id])
        render_read_only if @step.map.read_only_by_plan?
      end

      def render_read_only = render(json: { message: t("maps.errors.read_only") }, status: :forbidden)

      def step_params
        params.require(:step).permit(:title, :step_kind, :starts_on, :due_on)
      end
  end
end
