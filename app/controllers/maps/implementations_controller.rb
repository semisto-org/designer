# The implementation plan of a map (« Mise en œuvre »): a full page next to
# the map, and the same plan as JSON for the editor and after each write.
# Everyone on the map reads it; editors propose Semisto's phasing and give
# elements to a phase (or take them out of every phase with phase_id null).
# `planned: true` also marks the elements « En projet », for a design drawn
# without marking what is still to be done.
module Maps
  class ImplementationsController < ApplicationController
    include MapScoped

    MAX_ASSIGN = 5_000

    before_action :set_map
    before_action :require_editor!, only: %i[proposal assign]

    def show
      respond_to do |format|
        format.html do
          render inertia: "maps/implementations/show", props: {
            map: { id: @map.id, name: @map.name, role: @role, teamId: @map.organization_id, offerBuilder: Offer.shown_to?(@map, Current.user) },
            plan: plan_json,
            canEdit: can_edit?,
            today: Date.current.iso8601
          }
        end
        format.json { render json: { plan: plan_json } }
      end
    end

    def proposal
      result = Implementation::Proposal.new(@map, by: Current.user).run!
      render json: { plan: plan_json, **result }
    end

    def assign
      ids = Array(params[:feature_ids]).map(&:to_i).uniq.first(MAX_ASSIGN)
      phase = params[:phase_id].present? ? @map.implementation_phases.find(params[:phase_id]) : nil
      planned = ActiveModel::Type::Boolean.new.cast(params[:planned])
      MapFeature.transaction do
        @map.features.where(id: ids, status: "active").find_each do |feature|
          properties = phase ? feature.properties.merge("phase_id" => phase.id) : feature.properties.except("phase_id")
          properties["planned"] = true if planned && !feature.plant? && feature.properties["built_on"].blank?
          next if properties == feature.properties
          feature.update!(properties:, updated_by: Current.user)
        end
      end
      render json: { plan: plan_json }
    rescue ActiveRecord::RecordInvalid => error
      render_errors error.record
    end

    private
      def plan_json = Implementation::Plan.new(@map.reload).as_json

      def can_edit? = %w[owner editor].include?(@role) && !@map.archived? && !@map.read_only_by_plan?
  end
end
