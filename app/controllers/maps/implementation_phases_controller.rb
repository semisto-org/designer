# The phases of a map's implementation plan (« Mise en œuvre »): editors add,
# change and delete them; each write answers with the whole plan. Deleting a
# phase keeps its elements, out of any phase. A phase an AI proposed (draft)
# is accepted, with the elements it proposed, or refused.
module Maps
  class ImplementationPhasesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!
    before_action :set_phase, only: %i[update destroy accept reject]

    def create
      phase = @map.implementation_phases.new(phase_params)
      if phase.save
        render json: { phase: { id: phase.id }, plan: plan_json }, status: :created
      else
        render_errors phase
      end
    end

    def update
      if @phase.update(phase_params)
        render json: { plan: plan_json }
      else
        render_errors @phase
      end
    rescue ActiveRecord::StaleObjectError
      render json: { message: t("implementation.errors.stale"), plan: plan_json }, status: :conflict
    end

    def destroy
      @phase.destroy!
      render json: { plan: plan_json }
    end

    def accept
      return head :unprocessable_entity unless @phase.draft?
      @phase.accept!(by: Current.user)
      render json: { plan: plan_json }
    end

    def reject
      return head :unprocessable_entity unless @phase.draft?
      @phase.destroy!
      render json: { plan: plan_json }
    end

    private
      def set_phase
        @phase = @map.implementation_phases.find(params[:id])
      end

      def phase_params
        params.require(:phase).permit(:name, :starts_on, :ends_on, :notes, :hours_override, :other_costs_cents, :lock_version)
      end

      def plan_json = Implementation::Plan.new(@map.reload).as_json
  end
end
