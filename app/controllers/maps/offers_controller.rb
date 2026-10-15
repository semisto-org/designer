# The offer builder of a map: one full page (Inertia) where the team sees
# what the map measures, picks its pricing, fills its internal sheet,
# corrects the computed lines and saves versions; its JSON for the editor
# panel; and the autosave of the working offer (optimistic locking with
# lock_version).
#
# Whoever may not use it (Offer.usable_by?) gets the page with what to do
# to use it, never the numbers.
module Maps
  class OffersController < ApplicationController
    include OfferScoped

    before_action :require_editor!, only: :update

    def show
      respond_to do |format|
        format.html do
          render inertia: "maps/offers/show", props: page_props
        end
        format.json { render json: { offer: offer_json.slice(:persisted, :updatedAt), totals: @offer.result["totals"], precision: @offer.result["precision"], versions: versions_json } }
      end
    end

    def update
      @offer.offer_template = template_param if params[:offer]&.key?(:template_id)
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
          map: @map.as_inertia(Current.user).slice(:id, :name, :address, :areaM2, :role, :teamId)
            .merge(offerBuilder: Offer.shown_to?(@map, Current.user)),
          team: @map.organization && { name: @map.organization.name, member: @map.organization.member?(Current.user) },
          canUseOffers: offer_access?, unavailableReason: (unavailable_reason unless offer_access?)
        }
        return base unless offer_access?
        base.merge(
          offer: offer_json, measures: measures_json, result: @offer.result, versions: versions_json,
          catalog: catalog_json, templates: templates_json,
          canEdit: %w[owner editor].include?(@role) && !@map.read_only_by_plan?
        )
      end

      def unavailable_reason
        return "not_member" if @map.organization
        @map.owner_id == Current.user&.id ? "no_plan" : "not_owner"
      end

      def templates_json
        OfferTemplate.where(owner: OfferTemplate.account_for(@map)).ordered.map { { id: _1.id, name: _1.name, clientTypes: _1.client_types } }
      end

      # nil (or blank): Semisto's pricing. Else a template of the map's account.
      def template_param
        id = params.dig(:offer, :template_id).presence
        id && OfferTemplate.where(owner: OfferTemplate.account_for(@map)).find(id)
      end

      def offer_params
        offer = params.require(:offer)
        # The inputs document is whitelisted and typed by Offer::Inputs.
        { inputs: offer[:inputs].respond_to?(:to_unsafe_h) ? offer[:inputs].to_unsafe_h : {}, lock_version: offer[:lock_version] }.compact
      end

      def catalog_json
        {
          phases: Offer::Pricing::PHASES,
          services: Offer::Pricing::SERVICES,
          adjustmentPresets: Offer::Inputs::ADJUSTMENT_PRESETS.map { |key, (pct, phase)| { key:, pct:, phase: } }
        }
      end
  end
end
