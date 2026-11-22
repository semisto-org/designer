# The design phases of a map (« Esquisse », « Avant-projet »…): everyone on
# the map reads them; editors put the phase in progress away, rename a
# phase, take an element back from it and delete it. A phase is a frozen
# copy of the project: nothing in it ever changes the map by itself.
module Maps
  class DesignPhasesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: %i[index show]
    before_action :set_phase, only: %i[show update destroy take]

    def index
      render json: payload
    end

    # The phase with its elements as they were, and how today differs.
    def show
      render json: @phase.as_json(snapshot: true).merge(compare: @phase.compare)
    end

    def create
      attributes = params.fetch(:phase, {}).permit(:name, :notes, :next_name)
      phase = MapPhase.put_away!(@map, name: attributes[:name], notes: attributes[:notes], next_name: attributes[:next_name], by: Current.user)
      render json: payload.merge(id: phase.id), status: :created
    rescue ActiveRecord::RecordInvalid => error
      render json: { message: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    def update
      if @phase.update(params.require(:phase).permit(:name, :notes))
        render json: payload
      else
        render json: { message: @phase.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
    end

    def rename_current
      name = params[:name].to_s.squish.first(60)
      return render(json: { message: t("design_phases.name_missing") }, status: :unprocessable_entity) if name.blank?

      @map.update_columns(design_phase_name: name, updated_at: Time.current)
      render json: payload
    end

    def destroy
      @phase.destroy!
      render json: payload
    end

    # An element of the phase, back on the map as a new element.
    def take
      feature = @phase.take!(params.require(:feature_id), by: Current.user)
      render json: { feature: feature.as_geojson }, status: :created
    rescue ActiveRecord::RecordInvalid => error
      render json: { message: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    private
      def set_phase
        @phase = @map.phases.find(params[:id])
      end

      def payload
        { current: @map.reload.current_design_phase_name, phases: @map.phases.listed.includes(:created_by).map(&:as_json) }
      end
  end
end
