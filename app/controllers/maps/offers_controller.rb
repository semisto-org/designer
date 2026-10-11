# The offer builder of a team map: one full page (Inertia) where the team
# sees what the map measures, fills its internal sheet, corrects the
# computed lines and saves versions; its JSON for the editor panel; and the
# autosave of the working offer (optimistic locking with lock_version).
#
# A map outside a team, or a visitor outside the team, gets the page with
# what to do to use it, never the numbers.
module Maps
  class OffersController < ApplicationController
    include OfferScoped

    before_action :require_editor!, only: :update

    def show
      respond_to do |format|
        format.html do
          render inertia: "maps/offers/show", props: page_props
        end
        format.json { render json: { offer: offer_json.slice(:persisted, :updatedAt), totals: @offer.result["totals"], versions: versions_json } }
      end
    end

    def update
      @offer.assign_attributes(offer_params)
      @offer.updated_by = Current.user
      if @offer.save
        render json: { offer: offer_json, measures: measures_json, result: @offer.result }
      else
        render_errors @offer
      end
    rescue ActiveRecord::StaleObjectError, ActiveRecord::RecordNotUnique
      @offer = @map.reload.offer
      render json: { message: t("offers.errors.stale"), offer: offer_json, measures: measures_json, result: @offer.result }, status: :conflict
    end

    private
      def page_props
        base = {
          map: @map.as_inertia(Current.user).slice(:id, :name, :address, :areaM2, :role),
          team: @map.organization && { name: @map.organization.name, member: team_member? },
          canUseOffers: team_member?
        }
        return base unless team_member?
        base.merge(
          offer: offer_json, measures: measures_json, result: @offer.result, versions: versions_json,
          catalog: catalog_json, canEdit: %w[owner editor].include?(@role) && !@map.read_only_by_plan?
        )
      end

      def offer_params
        offer = params.require(:offer)
        # The inputs document is whitelisted and typed by Offer::Inputs.
        { inputs: offer[:inputs].respond_to?(:to_unsafe_h) ? offer[:inputs].to_unsafe_h : {}, lock_version: offer[:lock_version] }.compact
      end

      def catalog_json
        {
          phases: Offer::Catalog::PHASES,
          services: Offer::Catalog::SERVICES,
          plantingTypes: Offer::Catalog::PLANTING_TYPES.map { |key, type| { key:, measure: type[:measure], mix: type[:mix] } },
          categories: Offer::Catalog::CATEGORIES.map { |key, spec| { key:, price: spec[:price] } },
          adjustmentPresets: Offer::Inputs::ADJUSTMENT_PRESETS.map { |key, (pct, phase)| { key:, pct:, phase: } }
        }
      end
  end
end
