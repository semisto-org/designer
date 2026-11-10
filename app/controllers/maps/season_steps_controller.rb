# The season steps of one map (SeasonSteps), drawn, moved and stretched on
# the frieze of its « Tâches » page. Editors only. Answers with the step and
# the whole task board (TaskBoard), since a step is a task of its season
# list.
module Maps
  class SeasonStepsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!
    before_action :set_step, only: %i[update destroy]

    def create
      task = SeasonSteps.create!(@map, step_params, by: Current.user)
      render json: { step: SeasonSteps.json(task), board: TaskBoard.new(@map) }, status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { message: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    def update
      @step.update!(step_params)
      render json: { step: SeasonSteps.json(@step), board: TaskBoard.new(@map) }
    rescue ActiveRecord::RecordInvalid => e
      render json: { message: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    def destroy
      @step.destroy!
      render json: { board: TaskBoard.new(@map) }
    end

    private
      def set_step
        @step = @map.tasks.steps.find(params[:id])
      end

      def step_params
        params.require(:step).permit(*SeasonSteps::PERMITTED)
      end
  end
end
