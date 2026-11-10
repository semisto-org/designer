# The « Présenter » sequences of a map: everyone on the map follows them,
# editors start one (from a template or empty), save its steps whole and
# delete it. Each answer gives the map's presentations and the templates;
# viewers get them without the presenter's notes and the AI's drafts.
module Maps
  class PresentationsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_presentation, only: %i[update destroy]

    def index
      render json: payload
    end

    def create
      template = PresentationTemplate.find(params[:template]) if params[:template].present?
      presentation = @map.presentations.new(
        name: template&.name || t("presentations.panel_title"),
        template_key: template&.key,
        steps: template&.steps(map: @map) || []
      )
      if presentation.save
        render json: payload.merge(id: presentation.id), status: :created
      else
        render json: { message: presentation.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
    rescue ActiveRecord::RecordNotFound
      head :not_found
    end

    def update
      attributes = params.require(:presentation).permit(:name, :lock_version)
      attributes[:steps] = Array(params[:presentation][:steps]).map { _1.respond_to?(:to_unsafe_h) ? _1.to_unsafe_h : _1 } if params[:presentation].key?(:steps)
      if @presentation.update(attributes)
        render json: payload
      else
        render json: { message: @presentation.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
    rescue ActiveRecord::StaleObjectError
      render json: payload.merge(message: t("presentations.stale")), status: :conflict
    end

    def destroy
      @presentation.destroy!
      render json: payload
    end

    private
      def set_presentation
        @presentation = @map.presentations.find(params[:id])
      end

      def payload
        list = @map.presentations.reload
        presentations = %w[owner editor].include?(@role) ? list.as_json : list.map(&:for_viewer).as_json
        { presentations:, templates: PresentationTemplate.all.as_json }
      end
  end
end
