# The financial dashboard of a map: full page (Inertia), summary for the
# editor panel (JSON), exports (CSV, XLSX), and saving the assumptions.
# Viewers read; owner and editors edit. A map without a saved plan shows a
# plan prefilled from the map, saved on the first change.
module Maps
  class FinancesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, only: %i[update sync]
    before_action :set_plan

    def show
      respond_to do |format|
        format.html do
          render inertia: "maps/finances/show", props: {
            map: @map.as_inertia(Current.user).slice(:id, :name, :areaM2, :role, :region),
            plan: plan_json,
            result: @plan.result.as_json,
            mapPlants: inventory.lines.map { { key: _1.key, name: _1.display_name, latinName: _1.latin_name, quantity: _1.quantity } },
            canEdit: %w[owner editor].include?(@role)
          }
        end
        format.json { render json: { plan: plan_json.slice(:persisted, :updatedAt), summary: summary_json } }
        format.csv { send_data export.to_csv, filename: export.filename("csv"), type: "text/csv; charset=utf-8" }
        format.xlsx { send_data export.to_xlsx, filename: export.filename("xlsx"), type: Mime[:xlsx] }
      end
    end

    def update
      @plan.assign_attributes(plan_params)
      save_and_render
    rescue ActiveRecord::StaleObjectError, ActiveRecord::RecordNotUnique
      # Someone else saved first (or created the plan at the same time).
      @plan = @map.reload.financial_plan
      render json: { message: t("finances.errors.stale"), plan: plan_json, result: @plan.result.as_json }, status: :conflict
    end

    # Brings the map's current plants into the plan.
    def sync
      counts = @plan.sync_species(inventory)
      save_and_render(sync: counts)
    end

    private
      def set_plan
        @plan = @map.financial_plan || FinancialPlan.build_for(@map, inventory:)
      end

      def inventory = @inventory ||= MapPlantInventory.new(@map)

      def export = @export ||= FinancialPlan::Export.new(@plan)

      def plan_params
        plan = params.require(:plan)
        # The inputs document is whitelisted and typed by FinancialPlan::Schema.
        { inputs: plan[:inputs].respond_to?(:to_unsafe_h) ? plan[:inputs].to_unsafe_h : {}, lock_version: plan[:lock_version] }.compact
      end

      def save_and_render(**extra)
        @plan.updated_by = Current.user
        if @plan.save
          render json: { plan: plan_json, result: @plan.result.as_json, **extra }
        else
          render_errors @plan
        end
      end

      def plan_json(plan = @plan)
        {
          inputs: plan.inputs.deep_transform_keys { _1.to_s.camelize(:lower) },
          lockVersion: plan.lock_version,
          persisted: plan.persisted?,
          updatedAt: plan.updated_at&.iso8601,
          areaHaFromMap: plan.area_ha_fallback&.round(4)
        }
      end

      def summary_json
        indicators = @plan.result.as_json["indicators"]
        indicators.slice("totalInvestment", "breakEvenYear", "paybackYear", "fundingNeed", "finalCash", "startYear", "peakPickingHours")
          .merge("speciesCount" => @plan.typed_inputs.species.size, "warningsCount" => @plan.result.warnings.size)
      end
  end
end
